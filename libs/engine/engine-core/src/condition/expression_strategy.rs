use dashmap::DashMap;
use parking_lot::RwLock;
use shared_types::{AlertCondition, ConditionMatch, EvaluationStrategy, NormalizedTick};
use std::sync::atomic::{AtomicU64, Ordering};

/// Simple expression DSL strategy for user-defined conditions.
///
/// Users write conditions like:
///   "value > 150"
///   "value >= 100 AND value <= 200"
///   "value > 150 AND secondary_value > 1000000"
///   "value != 0"
///
/// Expressions are parsed once into a compact AST on add_condition,
/// then evaluated per tick with zero allocation.
///
/// This is the "easy mode" for users who need simple numeric conditions
/// that don't fit the preset strategies. More complex logic uses ScriptStrategy.
pub struct ExpressionStrategy {
    /// symbol → list of condition IDs
    symbol_index: DashMap<String, Vec<String>>,
    /// condition_id → compiled expression + condition metadata
    conditions: DashMap<String, CompiledCondition>,
    condition_count: AtomicU64,
}

struct CompiledCondition {
    id: String,
    organization_id: String,
    subscriber_id: String,
    symbol: String,
    expr: Expr,
    channels: Vec<String>,
    template_id: Option<String>,
    cooldown_us: Option<u64>,
    last_triggered_us: RwLock<Option<u64>>,
    /// Original expression string for match_detail
    expression_str: String,
}

/// Compact AST for expressions.
#[derive(Debug, Clone)]
enum Expr {
    Compare(Field, CmpOp, f64),
    And(Box<Expr>, Box<Expr>),
    Or(Box<Expr>, Box<Expr>),
    Not(Box<Expr>),
}

#[derive(Debug, Clone, Copy)]
enum Field {
    Value,
    SecondaryValue,
}

#[derive(Debug, Clone, Copy)]
enum CmpOp {
    Gt,
    Gte,
    Lt,
    Lte,
    Eq,
    Neq,
}

/// Tick data accessible to expressions.
struct TickContext {
    value: f64,
    secondary_value: f64,
}

impl Expr {
    fn evaluate(&self, ctx: &TickContext) -> bool {
        match self {
            Expr::Compare(field, op, threshold) => {
                let field_val = match field {
                    Field::Value => ctx.value,
                    Field::SecondaryValue => ctx.secondary_value,
                };
                match op {
                    CmpOp::Gt => field_val > *threshold,
                    CmpOp::Gte => field_val >= *threshold,
                    CmpOp::Lt => field_val < *threshold,
                    CmpOp::Lte => field_val <= *threshold,
                    CmpOp::Eq => (field_val - threshold).abs() < f64::EPSILON,
                    CmpOp::Neq => (field_val - threshold).abs() >= f64::EPSILON,
                }
            }
            Expr::And(a, b) => a.evaluate(ctx) && b.evaluate(ctx),
            Expr::Or(a, b) => a.evaluate(ctx) || b.evaluate(ctx),
            Expr::Not(a) => !a.evaluate(ctx),
        }
    }
}

/// Simple recursive-descent parser for the expression DSL.
///
/// Grammar:
///   expr     = or_expr
///   or_expr  = and_expr ("OR" and_expr)*
///   and_expr = not_expr ("AND" not_expr)*
///   not_expr = "NOT" not_expr | atom
///   atom     = "(" expr ")" | comparison
///   comparison = field cmp_op number
///   field    = "value" | "secondary_value"
///   cmp_op   = ">" | ">=" | "<" | "<=" | "==" | "!="
///   number   = float literal
struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

#[derive(Debug, Clone)]
enum Token {
    Field(Field),
    Number(f64),
    Op(CmpOp),
    And,
    Or,
    Not,
    LParen,
    RParen,
}

fn tokenize(input: &str) -> Result<Vec<Token>, String> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();

    while let Some(&ch) = chars.peek() {
        match ch {
            ' ' | '\t' | '\n' | '\r' => {
                chars.next();
            }
            '(' => {
                tokens.push(Token::LParen);
                chars.next();
            }
            ')' => {
                tokens.push(Token::RParen);
                chars.next();
            }
            '>' => {
                chars.next();
                if chars.peek() == Some(&'=') {
                    chars.next();
                    tokens.push(Token::Op(CmpOp::Gte));
                } else {
                    tokens.push(Token::Op(CmpOp::Gt));
                }
            }
            '<' => {
                chars.next();
                if chars.peek() == Some(&'=') {
                    chars.next();
                    tokens.push(Token::Op(CmpOp::Lte));
                } else {
                    tokens.push(Token::Op(CmpOp::Lt));
                }
            }
            '=' => {
                chars.next();
                if chars.peek() == Some(&'=') {
                    chars.next();
                    tokens.push(Token::Op(CmpOp::Eq));
                } else {
                    return Err("Expected '==' for equality".into());
                }
            }
            '!' => {
                chars.next();
                if chars.peek() == Some(&'=') {
                    chars.next();
                    tokens.push(Token::Op(CmpOp::Neq));
                } else {
                    tokens.push(Token::Not);
                }
            }
            c if c.is_ascii_digit() || c == '-' || c == '.' => {
                let mut num_str = String::new();
                while let Some(&ch) = chars.peek() {
                    if ch.is_ascii_digit() || ch == '.' || ch == '-' || ch == 'e' || ch == 'E' || ch == '+' {
                        num_str.push(ch);
                        chars.next();
                    } else {
                        break;
                    }
                }
                let num: f64 = num_str.parse().map_err(|_| format!("Invalid number: {}", num_str))?;
                tokens.push(Token::Number(num));
            }
            c if c.is_ascii_alphabetic() || c == '_' => {
                let mut word = String::new();
                while let Some(&ch) = chars.peek() {
                    if ch.is_ascii_alphanumeric() || ch == '_' {
                        word.push(ch);
                        chars.next();
                    } else {
                        break;
                    }
                }
                match word.to_uppercase().as_str() {
                    "AND" => tokens.push(Token::And),
                    "OR" => tokens.push(Token::Or),
                    "NOT" => tokens.push(Token::Not),
                    "VALUE" | "value" | "price" | "PRICE" => tokens.push(Token::Field(Field::Value)),
                    "SECONDARY_VALUE" | "secondary_value" | "VOLUME" | "volume" => {
                        tokens.push(Token::Field(Field::SecondaryValue))
                    }
                    _ => return Err(format!("Unknown identifier: {}", word)),
                }
            }
            _ => return Err(format!("Unexpected character: {}", ch)),
        }
    }

    Ok(tokens)
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, pos: 0 }
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn advance(&mut self) -> Option<&Token> {
        let token = self.tokens.get(self.pos);
        self.pos += 1;
        token
    }

    fn parse_expr(&mut self) -> Result<Expr, String> {
        self.parse_or()
    }

    fn parse_or(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_and()?;
        while matches!(self.peek(), Some(Token::Or)) {
            self.advance();
            let right = self.parse_and()?;
            left = Expr::Or(Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_not()?;
        while matches!(self.peek(), Some(Token::And)) {
            self.advance();
            let right = self.parse_not()?;
            left = Expr::And(Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_not(&mut self) -> Result<Expr, String> {
        if matches!(self.peek(), Some(Token::Not)) {
            self.advance();
            let expr = self.parse_not()?;
            return Ok(Expr::Not(Box::new(expr)));
        }
        self.parse_atom()
    }

    fn parse_atom(&mut self) -> Result<Expr, String> {
        if matches!(self.peek(), Some(Token::LParen)) {
            self.advance();
            let expr = self.parse_expr()?;
            if !matches!(self.peek(), Some(Token::RParen)) {
                return Err("Expected ')'".into());
            }
            self.advance();
            return Ok(expr);
        }

        // comparison: field op number
        let field = match self.advance() {
            Some(Token::Field(f)) => *f,
            other => return Err(format!("Expected field name, got {:?}", other)),
        };
        let op = match self.advance() {
            Some(Token::Op(op)) => *op,
            other => return Err(format!("Expected comparison operator, got {:?}", other)),
        };
        let number = match self.advance() {
            Some(Token::Number(n)) => *n,
            other => return Err(format!("Expected number, got {:?}", other)),
        };

        Ok(Expr::Compare(field, op, number))
    }
}

fn parse_expression(input: &str) -> Result<Expr, String> {
    let tokens = tokenize(input)?;
    if tokens.is_empty() {
        return Err("Empty expression".into());
    }
    let mut parser = Parser::new(tokens);
    let expr = parser.parse_expr()?;
    if parser.pos < parser.tokens.len() {
        return Err(format!(
            "Unexpected tokens after expression at position {}",
            parser.pos
        ));
    }
    Ok(expr)
}

impl ExpressionStrategy {
    pub fn new() -> Self {
        Self {
            symbol_index: DashMap::new(),
            conditions: DashMap::new(),
            condition_count: AtomicU64::new(0),
        }
    }
}

impl Default for ExpressionStrategy {
    fn default() -> Self {
        Self::new()
    }
}

impl EvaluationStrategy for ExpressionStrategy {
    fn add_condition(&self, condition: &AlertCondition) {
        let expression_str = match condition.strategy_params.get("expression").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => return,
        };

        let expr = match parse_expression(&expression_str) {
            Ok(e) => e,
            Err(_) => return, // Invalid expression — skip
        };

        let compiled = CompiledCondition {
            id: condition.id.clone(),
            organization_id: condition.organization_id.clone(),
            subscriber_id: condition.subscriber_id.clone(),
            symbol: condition.symbol.clone(),
            expr,
            channels: condition.channels.clone(),
            template_id: condition.template_id.clone(),
            cooldown_us: condition.cooldown_ms.map(|ms| ms * 1000),
            last_triggered_us: RwLock::new(condition.last_triggered_us),
            expression_str,
        };

        self.conditions.insert(condition.id.clone(), compiled);
        self.symbol_index
            .entry(condition.symbol.clone())
            .or_default()
            .push(condition.id.clone());
        self.condition_count.fetch_add(1, Ordering::Relaxed);
    }

    fn remove_condition(&self, condition_id: &str) {
        if let Some((_, compiled)) = self.conditions.remove(condition_id) {
            if let Some(mut ids) = self.symbol_index.get_mut(&compiled.symbol) {
                ids.retain(|id| id != condition_id);
                if ids.is_empty() {
                    drop(ids);
                    self.symbol_index.remove(&compiled.symbol);
                }
            }
            self.condition_count.fetch_sub(1, Ordering::Relaxed);
        }
    }

    fn evaluate(&self, tick: &NormalizedTick) -> Vec<ConditionMatch> {
        let condition_ids = match self.symbol_index.get(&tick.symbol) {
            Some(ids) => ids.clone(),
            None => return Vec::new(),
        };

        let ctx = TickContext {
            value: tick.value,
            secondary_value: tick.secondary_value.unwrap_or(0.0),
        };

        let now_us = tick.timestamp_us;
        let mut matches = Vec::new();

        for cid in &condition_ids {
            if let Some(compiled) = self.conditions.get(cid) {
                if !compiled.expr.evaluate(&ctx) {
                    continue;
                }

                // Check cooldown
                if let Some(cooldown_us) = compiled.cooldown_us {
                    let last = *compiled.last_triggered_us.read();
                    if let Some(last_us) = last {
                        if now_us.saturating_sub(last_us) < cooldown_us {
                            continue;
                        }
                    }
                    *compiled.last_triggered_us.write() = Some(now_us);
                }

                matches.push(ConditionMatch {
                    condition_id: compiled.id.clone(),
                    organization_id: compiled.organization_id.clone(),
                    subscriber_id: compiled.subscriber_id.clone(),
                    symbol: tick.symbol.clone(),
                    matched_value: tick.value,
                    channels: compiled.channels.clone(),
                    template_id: compiled.template_id.clone(),
                    timestamp_us: now_us,
                    match_detail: Some(format!("Expression matched: {}", compiled.expression_str)),
                });
            }
        }

        matches
    }

    fn condition_count(&self) -> u64 {
        self.condition_count.load(Ordering::Relaxed)
    }

    fn strategy_type(&self) -> &'static str {
        "expression"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_expr_condition(id: &str, symbol: &str, expression: &str) -> AlertCondition {
        AlertCondition {
            id: id.to_string(),
            organization_id: "org1".to_string(),
            subscriber_id: "sub1".to_string(),
            symbol: symbol.to_string(),
            strategy_type: "expression".to_string(),
            strategy_params: serde_json::json!({ "expression": expression }),
            channels: vec!["email".to_string()],
            template_id: None,
            active: true,
            cooldown_ms: None,
            last_triggered_us: None,
        }
    }

    #[test]
    fn test_simple_gt() {
        let s = ExpressionStrategy::new();
        s.add_condition(&make_expr_condition("c1", "AAPL", "value > 150"));

        let tick = NormalizedTick::numeric("AAPL".into(), 151.0, 1000);
        assert_eq!(s.evaluate(&tick).len(), 1);

        let tick2 = NormalizedTick::numeric("AAPL".into(), 149.0, 2000);
        assert!(s.evaluate(&tick2).is_empty());
    }

    #[test]
    fn test_and_expression() {
        let s = ExpressionStrategy::new();
        s.add_condition(&make_expr_condition("c1", "AAPL", "value > 150 AND secondary_value > 1000000"));

        // value matches but secondary doesn't
        let mut tick = NormalizedTick::numeric("AAPL".into(), 160.0, 1000);
        tick.secondary_value = Some(500000.0);
        assert!(s.evaluate(&tick).is_empty());

        // Both match
        tick.secondary_value = Some(2000000.0);
        assert_eq!(s.evaluate(&tick).len(), 1);
    }

    #[test]
    fn test_or_expression() {
        let s = ExpressionStrategy::new();
        s.add_condition(&make_expr_condition("c1", "AAPL", "value > 200 OR value < 100"));

        let tick1 = NormalizedTick::numeric("AAPL".into(), 150.0, 1000);
        assert!(s.evaluate(&tick1).is_empty());

        let tick2 = NormalizedTick::numeric("AAPL".into(), 210.0, 2000);
        assert_eq!(s.evaluate(&tick2).len(), 1);

        let tick3 = NormalizedTick::numeric("AAPL".into(), 90.0, 3000);
        assert_eq!(s.evaluate(&tick3).len(), 1);
    }

    #[test]
    fn test_price_alias() {
        let s = ExpressionStrategy::new();
        s.add_condition(&make_expr_condition("c1", "AAPL", "price > 150"));

        let tick = NormalizedTick::numeric("AAPL".into(), 151.0, 1000);
        assert_eq!(s.evaluate(&tick).len(), 1);
    }

    #[test]
    fn test_parenthesized_expression() {
        let s = ExpressionStrategy::new();
        s.add_condition(&make_expr_condition(
            "c1",
            "AAPL",
            "(value > 100 AND value < 200) OR value > 500",
        ));

        let tick1 = NormalizedTick::numeric("AAPL".into(), 150.0, 1000);
        assert_eq!(s.evaluate(&tick1).len(), 1);

        let tick2 = NormalizedTick::numeric("AAPL".into(), 300.0, 2000);
        assert!(s.evaluate(&tick2).is_empty());

        let tick3 = NormalizedTick::numeric("AAPL".into(), 600.0, 3000);
        assert_eq!(s.evaluate(&tick3).len(), 1);
    }
}
