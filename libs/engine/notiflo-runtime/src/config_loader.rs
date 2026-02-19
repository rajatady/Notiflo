use std::collections::HashSet;
use std::sync::Arc;

use anyhow::Result;
use bson::{doc, DateTime as BsonDateTime};
use mongodb::Collection;
use serde::Deserialize;
use tokio::time::{self, Duration};
use tracing::{debug, error, info};

use engine_core::condition::store::ConditionStore;
use shared_types::AlertCondition;

/// MongoDB document shape for alert conditions.
/// Matches the Mongoose schema in alerts.service.ts (camelCase fields).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoAlertCondition {
    #[serde(rename = "_id")]
    pub id: bson::oid::ObjectId,
    pub organization_id: String,
    pub subscriber_id: String,
    pub symbol: String,
    pub strategy_type: String,
    pub strategy_params: serde_json::Value,
    pub channels: Vec<String>,
    pub template_id: Option<String>,
    pub active: bool,
    pub cooldown_ms: Option<u64>,
    pub updated_at: Option<BsonDateTime>,
}

impl MongoAlertCondition {
    pub fn to_engine_condition(&self) -> AlertCondition {
        AlertCondition {
            id: self.id.to_hex(),
            organization_id: self.organization_id.clone(),
            subscriber_id: self.subscriber_id.clone(),
            symbol: self.symbol.clone(),
            strategy_type: self.strategy_type.clone(),
            strategy_params: self.strategy_params.clone(),
            channels: self.channels.clone(),
            template_id: self.template_id.clone(),
            active: self.active,
            cooldown_ms: self.cooldown_ms,
            last_triggered_us: None,
        }
    }
}

pub struct ConfigLoader {
    collection: Collection<MongoAlertCondition>,
    store: Arc<ConditionStore>,
    poll_interval: Duration,
    known_ids: HashSet<String>,
    last_poll_time: Option<BsonDateTime>,
    reconcile_counter: u32,
}

impl ConfigLoader {
    pub fn new(
        collection: Collection<MongoAlertCondition>,
        store: Arc<ConditionStore>,
        poll_interval_ms: u64,
    ) -> Self {
        Self {
            collection,
            store,
            poll_interval: Duration::from_millis(poll_interval_ms),
            known_ids: HashSet::new(),
            last_poll_time: None,
            reconcile_counter: 0,
        }
    }

    /// Initial full load of all active conditions.
    pub async fn initial_load(&mut self) -> Result<u32> {
        use futures_util::TryStreamExt;

        let filter = doc! { "active": true };
        let mut cursor = self.collection.find(filter).await?;

        let mut conditions = Vec::new();
        while let Some(doc) = cursor.try_next().await? {
            self.known_ids.insert(doc.id.to_hex());
            if let Some(updated) = &doc.updated_at {
                match &self.last_poll_time {
                    Some(existing) if updated > existing => {
                        self.last_poll_time = Some(*updated);
                    }
                    None => {
                        self.last_poll_time = Some(*updated);
                    }
                    _ => {}
                }
            }
            conditions.push(doc.to_engine_condition());
        }

        let count = self.store.bulk_load(&conditions);
        info!(count = count, total_docs = conditions.len(), "Initial condition load complete");
        Ok(count)
    }

    /// Run the polling loop forever. Call after initial_load.
    pub async fn poll_loop(&mut self) {
        let mut interval = time::interval(self.poll_interval);
        // Skip the first immediate tick (we already did initial_load)
        interval.tick().await;

        loop {
            interval.tick().await;

            if let Err(e) = self.poll_delta().await {
                error!(error = %e, "Config poll delta failed");
            }

            self.reconcile_counter += 1;
            // Full reconciliation every ~30s (6 polls at 5s interval)
            let reconcile_interval = 30_000 / self.poll_interval.as_millis().max(1) as u32;
            if self.reconcile_counter >= reconcile_interval.max(1) {
                self.reconcile_counter = 0;
                if let Err(e) = self.reconcile().await {
                    error!(error = %e, "Config reconciliation failed");
                }
            }
        }
    }

    /// Poll for changes since last_poll_time.
    async fn poll_delta(&mut self) -> Result<()> {
        use futures_util::TryStreamExt;

        let filter = match &self.last_poll_time {
            Some(ts) => doc! { "updatedAt": { "$gt": ts } },
            None => doc! {},
        };

        let mut cursor = self.collection.find(filter).await?;
        let mut added = 0u32;
        let mut updated = 0u32;
        let mut deactivated = 0u32;

        while let Some(doc) = cursor.try_next().await? {
            let id = doc.id.to_hex();

            if let Some(updated_at) = &doc.updated_at {
                match &self.last_poll_time {
                    Some(existing) if updated_at > existing => {
                        self.last_poll_time = Some(*updated_at);
                    }
                    None => {
                        self.last_poll_time = Some(*updated_at);
                    }
                    _ => {}
                }
            }

            if doc.active {
                let condition = doc.to_engine_condition();
                if self.known_ids.contains(&id) {
                    self.store.update_condition(&condition);
                    updated += 1;
                } else {
                    self.store.add_condition(&condition);
                    self.known_ids.insert(id);
                    added += 1;
                }
            } else if self.known_ids.remove(&id) {
                self.store.remove_condition(&id);
                deactivated += 1;
            }
        }

        if added > 0 || updated > 0 || deactivated > 0 {
            debug!(added, updated, deactivated, "Config delta poll applied");
        }

        Ok(())
    }

    /// Full reconciliation: remove conditions that no longer exist in MongoDB.
    async fn reconcile(&mut self) -> Result<()> {
        use futures_util::TryStreamExt;

        let filter = doc! { "active": true };
        let mut cursor = self.collection.find(filter).await?;

        let mut active_ids = HashSet::new();
        while let Some(doc) = cursor.try_next().await? {
            active_ids.insert(doc.id.to_hex());
        }

        let stale: Vec<String> = self
            .known_ids
            .iter()
            .filter(|id| !active_ids.contains(*id))
            .cloned()
            .collect();

        for id in &stale {
            self.store.remove_condition(id);
            self.known_ids.remove(id);
        }

        if !stale.is_empty() {
            info!(removed = stale.len(), "Reconciliation removed stale conditions");
        }

        Ok(())
    }
}
