use std::time::{Duration, Instant};

use anyhow::Result;
use reqwest::Client;
use tracing::warn;
use uuid::Uuid;

use shared_types::{DeliveryRequest, DeliveryResult};

use super::retry::RetryPolicy;

/// Provider endpoint configuration loaded from MongoDB.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ProviderConfig {
    pub organization_id: String,
    pub channel: String,
    pub provider: String,
    pub endpoint: String,
    pub auth_header: Option<String>,
    pub timeout_ms: u64,
}

/// Generic HTTP provider that POSTs delivery payloads to configured endpoints.
pub struct HttpProvider {
    client: Client,
    configs: dashmap::DashMap<(String, String), ProviderConfig>, // (org_id, channel) -> config
    retry_policy: RetryPolicy,
}

impl HttpProvider {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .pool_max_idle_per_host(20)
                .build()
                .expect("Failed to build HTTP client"),
            configs: dashmap::DashMap::new(),
            retry_policy: RetryPolicy::default(),
        }
    }

    #[allow(dead_code)]
    pub fn set_config(&self, config: ProviderConfig) {
        self.configs.insert(
            (config.organization_id.clone(), config.channel.clone()),
            config,
        );
    }

    #[allow(dead_code)]
    pub fn load_configs(&self, configs: Vec<ProviderConfig>) {
        for config in configs {
            self.set_config(config);
        }
    }

    /// Send a delivery request with retry. Returns the final result.
    pub async fn send_with_retry(&self, request: &DeliveryRequest) -> DeliveryResult {
        let config = self.configs.get(&(
            request.organization_id.clone(),
            request.channel.clone(),
        ));

        let config = match config {
            Some(c) => c.clone(),
            None => {
                return DeliveryResult {
                    request_id: request.id.clone(),
                    condition_match_id: request.condition_match_id.clone(),
                    organization_id: request.organization_id.clone(),
                    subscriber_id: request.subscriber_id.clone(),
                    channel: request.channel.clone(),
                    provider: "none".to_string(),
                    success: false,
                    message_id: None,
                    error: Some(format!(
                        "No provider configured for org={} channel={}",
                        request.organization_id, request.channel
                    )),
                    latency_us: 0,
                    timestamp_us: now_us(),
                };
            }
        };

        let mut last_error = None;
        let start = Instant::now();

        for attempt in 0..self.retry_policy.max_attempts {
            if attempt > 0 {
                let delay = self.retry_policy.delay_for_attempt(attempt);
                tokio::time::sleep(delay).await;
            }

            match self.do_send(&config, request).await {
                Ok(message_id) => {
                    let latency_us = start.elapsed().as_micros() as u64;
                    return DeliveryResult {
                        request_id: request.id.clone(),
                        condition_match_id: request.condition_match_id.clone(),
                        organization_id: request.organization_id.clone(),
                        subscriber_id: request.subscriber_id.clone(),
                        channel: request.channel.clone(),
                        provider: config.provider.clone(),
                        success: true,
                        message_id: Some(message_id),
                        error: None,
                        latency_us,
                        timestamp_us: now_us(),
                    };
                }
                Err(e) => {
                    let retryable = is_retryable_error(&e);
                    warn!(
                        attempt = attempt + 1,
                        max = self.retry_policy.max_attempts,
                        retryable,
                        error = %e,
                        "Delivery attempt failed"
                    );
                    last_error = Some(e.to_string());
                    if !retryable {
                        break;
                    }
                }
            }
        }

        let latency_us = start.elapsed().as_micros() as u64;
        DeliveryResult {
            request_id: request.id.clone(),
            condition_match_id: request.condition_match_id.clone(),
            organization_id: request.organization_id.clone(),
            subscriber_id: request.subscriber_id.clone(),
            channel: request.channel.clone(),
            provider: config.provider.clone(),
            success: false,
            message_id: None,
            error: last_error,
            latency_us,
            timestamp_us: now_us(),
        }
    }

    async fn do_send(
        &self,
        config: &ProviderConfig,
        request: &DeliveryRequest,
    ) -> Result<String> {
        let mut builder = self
            .client
            .post(&config.endpoint)
            .json(&request.rendered_content)
            .timeout(Duration::from_millis(config.timeout_ms));

        if let Some(auth) = &config.auth_header {
            builder = builder.header("Authorization", auth);
        }

        let response = builder.send().await?;
        let status = response.status();

        if status.is_success() {
            // Try to extract a message ID from the response
            let body: serde_json::Value = response.json().await.unwrap_or_default();
            let message_id = body
                .get("id")
                .or_else(|| body.get("message_id"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let message_id = if message_id.is_empty() {
                Uuid::new_v4().to_string()
            } else {
                message_id
            };
            Ok(message_id)
        } else {
            let body = response.text().await.unwrap_or_default();
            Err(anyhow::anyhow!(
                "HTTP {} from {}: {}",
                status.as_u16(),
                config.endpoint,
                &body[..body.len().min(500)]
            ))
        }
    }
}

fn is_retryable_error(error: &anyhow::Error) -> bool {
    let msg = error.to_string();
    // Retry on 429, 5xx, timeouts, connection errors
    msg.contains("HTTP 429")
        || msg.contains("HTTP 500")
        || msg.contains("HTTP 502")
        || msg.contains("HTTP 503")
        || msg.contains("HTTP 504")
        || msg.contains("timed out")
        || msg.contains("connection")
        || msg.contains("Connection")
}

fn now_us() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_micros() as u64
}
