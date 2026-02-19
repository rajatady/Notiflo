use std::collections::HashMap;

use anyhow::{Context, Result};
use dashmap::DashMap;
use mongodb::Collection;
use serde::Deserialize;
use tracing::warn;

use shared_types::SubscriberRouting;

/// MongoDB subscriber document shape.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct MongoSubscriber {
    #[serde(rename = "_id")]
    pub id: bson::oid::ObjectId,
    pub organization_id: String,
    pub external_id: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub push_tokens: Option<Vec<String>>,
    pub channel_preferences: Option<HashMap<String, ChannelPref>>,
}

#[derive(Debug, Deserialize)]
pub struct ChannelPref {
    pub enabled: Option<bool>,
    #[serde(rename = "providerId")]
    pub provider_id: Option<String>,
}

impl MongoSubscriber {
    pub fn to_routing(&self) -> SubscriberRouting {
        let mut channel_endpoints = HashMap::new();
        let mut enabled_channels = Vec::new();
        let mut provider_overrides = HashMap::new();

        if let Some(prefs) = &self.channel_preferences {
            for (channel, pref) in prefs {
                let enabled = pref.enabled.unwrap_or(true);
                if !enabled {
                    continue;
                }

                // Map channel to endpoint
                let endpoint = match channel.as_str() {
                    "email" => self.email.clone(),
                    "sms" => self.phone.clone(),
                    "push" => self.push_tokens.as_ref().and_then(|t| t.first()).cloned(),
                    "in_app" => Some(self.id.to_hex()), // subscriber ID as endpoint
                    "webhook" => None, // webhooks use org-level config
                    _ => None,
                };

                if let Some(ep) = endpoint {
                    channel_endpoints.insert(channel.clone(), ep);
                    enabled_channels.push(channel.clone());
                }

                if let Some(pid) = &pref.provider_id {
                    provider_overrides.insert(channel.clone(), pid.clone());
                }
            }
        } else {
            // No preferences — auto-detect from available data
            if let Some(email) = &self.email {
                channel_endpoints.insert("email".to_string(), email.clone());
                enabled_channels.push("email".to_string());
            }
            if let Some(phone) = &self.phone {
                channel_endpoints.insert("sms".to_string(), phone.clone());
                enabled_channels.push("sms".to_string());
            }
            if let Some(tokens) = &self.push_tokens {
                if let Some(token) = tokens.first() {
                    channel_endpoints.insert("push".to_string(), token.clone());
                    enabled_channels.push("push".to_string());
                }
            }
        }

        SubscriberRouting {
            subscriber_id: self.id.to_hex(),
            organization_id: self.organization_id.clone(),
            channel_endpoints,
            enabled_channels,
            provider_overrides: if provider_overrides.is_empty() {
                None
            } else {
                Some(provider_overrides)
            },
        }
    }
}

/// In-memory cache of subscriber routing data, backed by MongoDB.
pub struct SubscriberCache {
    cache: DashMap<String, SubscriberRouting>,
    collection: Collection<MongoSubscriber>,
}

impl SubscriberCache {
    pub fn new(collection: Collection<MongoSubscriber>) -> Self {
        Self {
            cache: DashMap::new(),
            collection,
        }
    }

    /// Get subscriber routing, loading from MongoDB if not cached.
    pub async fn get(&self, subscriber_id: &str) -> Result<Option<SubscriberRouting>> {
        // Check cache first
        if let Some(entry) = self.cache.get(subscriber_id) {
            return Ok(Some(entry.clone()));
        }

        // Load from MongoDB
        let oid = bson::oid::ObjectId::parse_str(subscriber_id)
            .with_context(|| format!("Invalid subscriber ID: {}", subscriber_id))?;
        let filter = bson::doc! { "_id": oid };

        let doc = self
            .collection
            .find_one(filter)
            .await
            .context("Failed to query subscriber from MongoDB")?;

        match doc {
            Some(subscriber) => {
                let routing = subscriber.to_routing();
                self.cache.insert(subscriber_id.to_string(), routing.clone());
                Ok(Some(routing))
            }
            None => {
                warn!(subscriber_id = %subscriber_id, "Subscriber not found in MongoDB");
                Ok(None)
            }
        }
    }

    /// Clear the entire cache (called on periodic refresh).
    #[allow(dead_code)]
    pub fn clear(&self) {
        self.cache.clear();
    }
}
