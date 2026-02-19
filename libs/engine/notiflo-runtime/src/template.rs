use dashmap::DashMap;
use handlebars::Handlebars;
use mongodb::Collection;
use serde::Deserialize;

use shared_types::ConditionMatch;

/// MongoDB template document shape.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct MongoTemplate {
    #[serde(rename = "_id")]
    pub id: bson::oid::ObjectId,
    pub name: String,
    pub channels: serde_json::Value, // { "email": { "subject": "...", "body": "..." }, ... }
    pub active: bool,
}

/// Renders notification templates using Handlebars.
/// Caches templates from MongoDB in memory.
pub struct TemplateRenderer {
    handlebars: Handlebars<'static>,
    cache: DashMap<String, serde_json::Value>, // template_id -> channels object
    collection: Option<Collection<MongoTemplate>>,
}

impl TemplateRenderer {
    pub fn new(collection: Option<Collection<MongoTemplate>>) -> Self {
        let mut hb = Handlebars::new();
        hb.set_strict_mode(false); // Missing variables render as empty string
        Self {
            handlebars: hb,
            cache: DashMap::new(),
            collection,
        }
    }

    /// Load all active templates from MongoDB into cache.
    pub async fn load_templates(&self) -> anyhow::Result<usize> {
        use futures_util::TryStreamExt;

        let collection = match &self.collection {
            Some(c) => c,
            None => return Ok(0),
        };

        let filter = bson::doc! { "active": true };
        let mut cursor = collection.find(filter).await?;
        let mut count = 0;

        while let Some(doc) = cursor.try_next().await? {
            self.cache.insert(doc.id.to_hex(), doc.channels);
            count += 1;
        }

        tracing::info!(count, "Templates loaded into cache");
        Ok(count)
    }

    /// Render content for a condition match and channel.
    pub async fn render_for_match(
        &self,
        condition_match: &ConditionMatch,
        channel: &str,
        endpoint: &str,
    ) -> serde_json::Value {
        // Build template variables from the match
        let variables = serde_json::json!({
            "symbol": condition_match.symbol,
            "matchedValue": condition_match.matched_value,
            "conditionId": condition_match.condition_id,
            "subscriberId": condition_match.subscriber_id,
            "channel": channel,
            "endpoint": endpoint,
            "matchDetail": condition_match.match_detail,
        });

        // Try to find template
        if let Some(template_id) = &condition_match.template_id {
            if let Some(channels) = self.cache.get(template_id) {
                if let Some(channel_tmpl) = channels.get(channel) {
                    return self.render_channel_template(channel_tmpl, &variables);
                }
            } else {
                // Cache miss — try loading from MongoDB
                if let Some(collection) = &self.collection {
                    if let Ok(oid) = bson::oid::ObjectId::parse_str(template_id) {
                        let filter = bson::doc! { "_id": oid };
                        if let Ok(Some(doc)) = collection.find_one(filter).await {
                            self.cache.insert(doc.id.to_hex(), doc.channels.clone());
                            if let Some(channel_tmpl) = doc.channels.get(channel) {
                                return self.render_channel_template(channel_tmpl, &variables);
                            }
                        }
                    }
                }
            }
        }

        // No template found — use default payload
        self.default_payload(condition_match, channel, endpoint)
    }

    fn render_channel_template(
        &self,
        template: &serde_json::Value,
        variables: &serde_json::Value,
    ) -> serde_json::Value {
        let subject = template
            .get("subject")
            .and_then(|s| s.as_str())
            .and_then(|s| self.handlebars.render_template(s, variables).ok());

        let body = template
            .get("body")
            .and_then(|b| b.as_str())
            .and_then(|b| self.handlebars.render_template(b, variables).ok())
            .unwrap_or_else(|| format!("Alert: {} = {}", variables["symbol"], variables["matchedValue"]));

        let mut result = serde_json::json!({ "body": body });
        if let Some(subject) = subject {
            result["subject"] = serde_json::Value::String(subject);
        }
        if let Some(metadata) = template.get("metadata") {
            result["metadata"] = metadata.clone();
        }
        result
    }

    fn default_payload(
        &self,
        condition_match: &ConditionMatch,
        channel: &str,
        endpoint: &str,
    ) -> serde_json::Value {
        serde_json::json!({
            "to": endpoint,
            "channel": channel,
            "subject": format!("Alert: {} triggered", condition_match.symbol),
            "body": format!(
                "{} matched at value {} — {}",
                condition_match.symbol,
                condition_match.matched_value,
                condition_match.match_detail.as_deref().unwrap_or("condition matched")
            ),
        })
    }
}
