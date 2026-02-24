use std::collections::HashSet;

use anyhow::Result;
use bson::{doc, DateTime as BsonDateTime};
use mongodb::Collection;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

/// MongoDB document shape for connectors.
/// Matches the NestJS Mongoose schema (camelCase fields).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoConnector {
    #[serde(rename = "_id")]
    pub id: bson::oid::ObjectId,
    pub organization_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub connector_type: String,
    pub config: serde_json::Value,
    pub active: bool,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub status_message: Option<String>,
    #[serde(default)]
    pub ticks_ingested: Option<u64>,
    #[serde(default)]
    pub last_tick_at: Option<BsonDateTime>,
    #[serde(default)]
    pub updated_at: Option<BsonDateTime>,
}

impl MongoConnector {
    pub fn id_hex(&self) -> String {
        self.id.to_hex()
    }
}

pub struct ConnectorChanges {
    pub added: Vec<MongoConnector>,
    pub removed: Vec<String>,
    pub updated: Vec<MongoConnector>,
}

pub struct ConnectorLoader {
    collection: Collection<MongoConnector>,
    known_ids: HashSet<String>,
    last_poll_time: Option<BsonDateTime>,
}

impl ConnectorLoader {
    pub fn new(collection: Collection<MongoConnector>) -> Self {
        Self {
            collection,
            known_ids: HashSet::new(),
            last_poll_time: None,
        }
    }

    /// Initial full load of all active connectors.
    pub async fn initial_load(&mut self) -> Result<Vec<MongoConnector>> {
        use futures_util::TryStreamExt;

        let filter = doc! { "active": true };
        let mut cursor = self.collection.find(filter).await?;

        let mut connectors = Vec::new();
        while let Some(doc) = cursor.try_next().await? {
            let id = doc.id_hex();
            self.known_ids.insert(id);

            if let Some(updated) = &doc.updated_at {
                self.track_poll_time(updated);
            }
            connectors.push(doc);
        }

        info!(count = connectors.len(), "Initial connector load complete");
        Ok(connectors)
    }

    /// Poll for changes since last poll. Returns added, removed, and updated connectors.
    pub async fn poll_changes(&mut self) -> Result<ConnectorChanges> {
        use futures_util::TryStreamExt;

        let filter = match &self.last_poll_time {
            Some(ts) => doc! { "updatedAt": { "$gt": ts } },
            None => doc! {},
        };

        let mut cursor = self.collection.find(filter).await?;

        let mut added = Vec::new();
        let mut updated = Vec::new();
        let mut removed = Vec::new();

        while let Some(doc) = cursor.try_next().await? {
            let id = doc.id_hex();

            if let Some(updated_at) = &doc.updated_at {
                self.track_poll_time(updated_at);
            }

            if doc.active {
                if self.known_ids.contains(&id) {
                    updated.push(doc);
                } else {
                    self.known_ids.insert(id);
                    added.push(doc);
                }
            } else if self.known_ids.remove(&id) {
                removed.push(id);
            }
        }

        if !added.is_empty() || !removed.is_empty() || !updated.is_empty() {
            debug!(
                added = added.len(),
                removed = removed.len(),
                updated = updated.len(),
                "Connector changes detected"
            );
        }

        Ok(ConnectorChanges {
            added,
            removed,
            updated,
        })
    }

    /// Write status and metrics back to MongoDB for a connector.
    pub async fn update_status(
        &self,
        id: &str,
        status: &str,
        ticks_ingested: u64,
        last_tick_at: Option<BsonDateTime>,
    ) -> Result<()> {
        let oid = bson::oid::ObjectId::parse_str(id)?;
        let mut update_doc = doc! {
            "$set": {
                "status": status,
                "ticksIngested": ticks_ingested as i64,
            }
        };

        if let Some(ts) = last_tick_at {
            update_doc
                .get_document_mut("$set")
                .unwrap()
                .insert("lastTickAt", ts);
        }

        self.collection
            .update_one(doc! { "_id": oid }, update_doc)
            .await?;

        Ok(())
    }

    fn track_poll_time(&mut self, updated_at: &BsonDateTime) {
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
}
