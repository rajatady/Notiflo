use mongodb::{Client as MongoClient, Database};
use uuid::Uuid;

pub async fn mongo_test_db() -> (MongoClient, Database, String) {
    let uri = std::env::var("NOTIFLO_MONGODB_URI")
        .unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let client = MongoClient::with_uri_str(&uri)
        .await
        .expect("Failed to connect to test MongoDB");
    let db_name = format!("notiflo_inttest_{}", &Uuid::new_v4().to_string()[..8]);
    let db = client.database(&db_name);
    (client, db, db_name)
}

pub async fn redis_test_conn() -> redis::aio::MultiplexedConnection {
    let url = std::env::var("NOTIFLO_REDIS_URL")
        .unwrap_or_else(|_| "redis://localhost:6379".to_string());
    let client = redis::Client::open(url.as_str()).expect("Redis client failed");
    client
        .get_multiplexed_async_connection()
        .await
        .expect("Redis connection failed")
}

pub async fn drop_test_db(client: &MongoClient, db_name: &str) {
    client.database(db_name).drop().await.ok();
}
