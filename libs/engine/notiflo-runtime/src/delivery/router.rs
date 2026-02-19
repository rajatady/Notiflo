use anyhow::{Context, Result};
use uuid::Uuid;

use shared_types::{ConditionMatch, DeliveryRequest};

use crate::subscriber_cache::SubscriberCache;
use crate::template::TemplateRenderer;

/// Resolves a ConditionMatch into one or more DeliveryRequests.
/// Looks up subscriber routing data, renders templates, builds requests.
pub struct DeliveryRouter {
    subscriber_cache: SubscriberCache,
    template_renderer: TemplateRenderer,
}

impl DeliveryRouter {
    pub fn new(subscriber_cache: SubscriberCache, template_renderer: TemplateRenderer) -> Self {
        Self {
            subscriber_cache,
            template_renderer,
        }
    }

    /// Resolve a condition match into delivery requests (one per channel).
    pub async fn resolve(&self, condition_match: &ConditionMatch) -> Result<Vec<DeliveryRequest>> {
        let routing = self
            .subscriber_cache
            .get(&condition_match.subscriber_id)
            .await
            .with_context(|| {
                format!(
                    "Failed to lookup subscriber: {}",
                    condition_match.subscriber_id
                )
            })?;

        let routing = match routing {
            Some(r) => r,
            None => {
                tracing::warn!(
                    subscriber_id = %condition_match.subscriber_id,
                    "Subscriber not found, skipping delivery"
                );
                return Ok(Vec::new());
            }
        };

        let mut requests = Vec::new();

        for channel in &condition_match.channels {
            // Check subscriber has this channel enabled
            if !routing.enabled_channels.contains(channel) {
                tracing::debug!(
                    channel = %channel,
                    subscriber_id = %condition_match.subscriber_id,
                    "Channel not enabled for subscriber, skipping"
                );
                continue;
            }

            // Check subscriber has an endpoint for this channel
            let endpoint = match routing.channel_endpoints.get(channel) {
                Some(ep) => ep.clone(),
                None => {
                    tracing::debug!(
                        channel = %channel,
                        subscriber_id = %condition_match.subscriber_id,
                        "No endpoint for channel, skipping"
                    );
                    continue;
                }
            };

            // Render template if available
            let rendered_content = self
                .template_renderer
                .render_for_match(condition_match, channel, &endpoint)
                .await;

            // Determine provider (subscriber override or default)
            let provider = routing
                .provider_overrides
                .as_ref()
                .and_then(|o| o.get(channel))
                .cloned()
                .unwrap_or_else(|| channel.clone());

            requests.push(DeliveryRequest {
                id: Uuid::new_v4().to_string(),
                condition_match_id: condition_match.condition_id.clone(),
                organization_id: condition_match.organization_id.clone(),
                subscriber_id: condition_match.subscriber_id.clone(),
                channel: channel.clone(),
                provider,
                rendered_content,
                timestamp_us: condition_match.timestamp_us,
            });
        }

        Ok(requests)
    }
}
