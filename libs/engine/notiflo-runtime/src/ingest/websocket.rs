use anyhow::{Context, Result};
use async_trait::async_trait;
use futures_util::StreamExt;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::connect_async;
use tracing::{debug, error, info, warn};

use shared_types::NormalizedTick;

use super::IngestSource;

pub struct WebSocketSource {
    url: String,
    reconnect_ms: u64,
    stream: Option<
        futures_util::stream::SplitStream<
            tokio_tungstenite::WebSocketStream<
                tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
            >,
        >,
    >,
}

impl WebSocketSource {
    pub fn new(url: String, reconnect_ms: u64) -> Self {
        Self {
            url,
            reconnect_ms,
            stream: None,
        }
    }

    async fn do_connect(&mut self) -> Result<()> {
        let (ws_stream, _response) = connect_async(&self.url)
            .await
            .with_context(|| format!("Failed to connect to WebSocket: {}", self.url))?;
        let (_write, read) = ws_stream.split();
        self.stream = Some(read);
        info!(url = %self.url, "WebSocket connected");
        Ok(())
    }
}

#[async_trait]
impl IngestSource for WebSocketSource {
    async fn connect(&mut self) -> Result<()> {
        let mut backoff_ms = self.reconnect_ms;
        let max_backoff_ms = 30_000;

        loop {
            match self.do_connect().await {
                Ok(()) => return Ok(()),
                Err(e) => {
                    warn!(
                        error = %e,
                        retry_ms = backoff_ms,
                        "WebSocket connection failed, retrying"
                    );
                    sleep(Duration::from_millis(backoff_ms)).await;
                    backoff_ms = (backoff_ms * 2).min(max_backoff_ms);
                }
            }
        }
    }

    async fn next_tick(&mut self) -> Result<NormalizedTick> {
        loop {
            let stream = match self.stream.as_mut() {
                Some(s) => s,
                None => {
                    self.connect().await?;
                    self.stream.as_mut().unwrap()
                }
            };

            match stream.next().await {
                Some(Ok(msg)) => {
                    let text = match msg {
                        tokio_tungstenite::tungstenite::Message::Text(t) => t,
                        tokio_tungstenite::tungstenite::Message::Binary(b) => {
                            String::from_utf8(b.into())
                                .context("WebSocket binary frame is not valid UTF-8")?
                        }
                        tokio_tungstenite::tungstenite::Message::Ping(_)
                        | tokio_tungstenite::tungstenite::Message::Pong(_) => continue,
                        tokio_tungstenite::tungstenite::Message::Close(_) => {
                            warn!("WebSocket closed by server, reconnecting");
                            self.stream = None;
                            continue;
                        }
                        _ => continue,
                    };

                    let tick: NormalizedTick = serde_json::from_str(&text)
                        .with_context(|| {
                            format!(
                                "Failed to parse WebSocket tick: {}",
                                &text[..text.len().min(200)]
                            )
                        })?;
                    debug!(symbol = %tick.symbol, value = tick.value, "Tick received from WebSocket");
                    return Ok(tick);
                }
                Some(Err(e)) => {
                    error!(error = %e, "WebSocket error, reconnecting");
                    self.stream = None;
                    sleep(Duration::from_millis(self.reconnect_ms)).await;
                }
                None => {
                    warn!("WebSocket stream ended, reconnecting");
                    self.stream = None;
                    sleep(Duration::from_millis(self.reconnect_ms)).await;
                }
            }
        }
    }
}
