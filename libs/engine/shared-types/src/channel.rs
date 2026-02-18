use serde::{Deserialize, Serialize};

/// Mirrors the TypeScript Channel enum in channel.types.ts
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Channel {
    Email,
    Sms,
    Push,
    Whatsapp,
    InApp,
    Webhook,
    Slack,
}

impl Channel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Channel::Email => "email",
            Channel::Sms => "sms",
            Channel::Push => "push",
            Channel::Whatsapp => "whatsapp",
            Channel::InApp => "in_app",
            Channel::Webhook => "webhook",
            Channel::Slack => "slack",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "email" => Some(Channel::Email),
            "sms" => Some(Channel::Sms),
            "push" => Some(Channel::Push),
            "whatsapp" => Some(Channel::Whatsapp),
            "in_app" => Some(Channel::InApp),
            "webhook" => Some(Channel::Webhook),
            "slack" => Some(Channel::Slack),
            _ => None,
        }
    }
}
