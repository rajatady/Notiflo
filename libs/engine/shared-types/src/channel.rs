use std::str::FromStr;

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
}

impl FromStr for Channel {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "email" => Ok(Channel::Email),
            "sms" => Ok(Channel::Sms),
            "push" => Ok(Channel::Push),
            "whatsapp" => Ok(Channel::Whatsapp),
            "in_app" => Ok(Channel::InApp),
            "webhook" => Ok(Channel::Webhook),
            "slack" => Ok(Channel::Slack),
            _ => Err(()),
        }
    }
}
