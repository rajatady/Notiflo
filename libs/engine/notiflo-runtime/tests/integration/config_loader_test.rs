#![cfg(feature = "integration-tests")]

use std::sync::Arc;

use bson::{doc, oid::ObjectId, DateTime as BsonDateTime};
use crossbeam_channel::bounded;
use mongodb::Collection;

use engine_core::condition::evaluator::StrategyRegistry;
use engine_core::condition::store::ConditionStore;
use engine_core::condition::threshold_crossing::ThresholdCrossingStrategy;

use notiflo_runtime_lib::config_loader::{ConfigLoader, MongoAlertCondition};

use super::common;

/// Insert a test condition document into MongoDB.
async fn insert_condition(
    collection: &Collection<bson::Document>,
    id: ObjectId,
    symbol: &str,
    active: bool,
) {
    let doc = doc! {
        "_id": id,
        "organizationId": "org-test",
        "subscriberId": "sub-test-1",
        "symbol": symbol,
        "strategyType": "threshold_crossing",
        "strategyParams": { "threshold": 150.0, "operator": "cross_above" },
        "channels": ["email"],
        "templateId": null,
        "active": active,
        "cooldownMs": null,
        "updatedAt": BsonDateTime::now(),
    };
    collection.insert_one(doc).await.expect("Failed to insert test condition");
}

fn make_store() -> Arc<ConditionStore> {
    let mut registry = StrategyRegistry::new();
    registry.register(Arc::new(ThresholdCrossingStrategy::new()));
    let (tx, _rx) = bounded(100_000);
    Arc::new(ConditionStore::new(Arc::new(registry), tx))
}

#[tokio::test]
async fn test_initial_load_returns_active_count() {
    let (client, db, db_name) = common::mongo_test_db().await;
    let raw_col = db.collection::<bson::Document>("alertconditions");

    // Insert 3 active + 1 inactive conditions
    let id1 = ObjectId::new();
    let id2 = ObjectId::new();
    let id3 = ObjectId::new();
    let id4 = ObjectId::new();

    insert_condition(&raw_col, id1, "AAPL", true).await;
    insert_condition(&raw_col, id2, "GOOG", true).await;
    insert_condition(&raw_col, id3, "TSLA", true).await;
    insert_condition(&raw_col, id4, "MSFT", false).await;

    let store = make_store();
    let typed_col: Collection<MongoAlertCondition> = db.collection("alertconditions");
    let mut loader = ConfigLoader::new(typed_col, store.clone(), 5000);

    let loaded = loader.initial_load().await.expect("initial_load failed");

    assert_eq!(loaded, 3, "Should load exactly 3 active conditions");
    assert_eq!(store.condition_count(), 3, "Store should have 3 conditions");

    common::drop_test_db(&client, &db_name).await;
}

#[tokio::test]
async fn test_second_initial_load_picks_up_new_conditions() {
    let (client, db, db_name) = common::mongo_test_db().await;
    let raw_col = db.collection::<bson::Document>("alertconditions");

    // Insert 2 active conditions
    insert_condition(&raw_col, ObjectId::new(), "AAPL", true).await;
    insert_condition(&raw_col, ObjectId::new(), "GOOG", true).await;

    let store = make_store();
    let typed_col: Collection<MongoAlertCondition> = db.collection("alertconditions");
    let mut loader = ConfigLoader::new(typed_col, store.clone(), 5000);

    let loaded = loader.initial_load().await.expect("first initial_load failed");
    assert_eq!(loaded, 2);

    // Insert another active condition after initial load
    insert_condition(&raw_col, ObjectId::new(), "TSLA", true).await;

    // Second initial_load should pick up the new condition
    let loaded2 = loader.initial_load().await.expect("second initial_load failed");
    assert_eq!(loaded2, 3, "Second load should pick up all 3 active conditions");

    common::drop_test_db(&client, &db_name).await;
}

#[tokio::test]
async fn test_store_condition_count_matches_loaded() {
    let (client, db, db_name) = common::mongo_test_db().await;
    let raw_col = db.collection::<bson::Document>("alertconditions");

    let count = 5;
    for i in 0..count {
        insert_condition(&raw_col, ObjectId::new(), &format!("SYM{}", i), true).await;
    }

    let store = make_store();
    let typed_col: Collection<MongoAlertCondition> = db.collection("alertconditions");
    let mut loader = ConfigLoader::new(typed_col, store.clone(), 5000);

    let loaded = loader.initial_load().await.expect("initial_load failed");

    assert_eq!(loaded as u64, store.condition_count());
    assert_eq!(store.condition_count(), count as u64);

    common::drop_test_db(&client, &db_name).await;
}
