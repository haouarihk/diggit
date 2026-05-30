use super::*;

#[derive(Debug, Serialize)]
pub(crate) struct ParsedSearchQuery {
    terms: Vec<String>,
    exact_terms: Vec<String>,
    regex_terms: Vec<String>,
    excluded_terms: Vec<String>,
    repo: Option<String>,
    user: Option<String>,
    org: Option<String>,
    is_fork: Option<bool>,
    unsupported_qualifiers: Vec<String>,
}

impl ParsedSearchQuery {
    pub(crate) fn parse(query: &str) -> Self {
        let mut parsed = Self {
            terms: Vec::new(),
            exact_terms: Vec::new(),
            regex_terms: Vec::new(),
            excluded_terms: Vec::new(),
            repo: None,
            user: None,
            org: None,
            is_fork: None,
            unsupported_qualifiers: Vec::new(),
        };
        let tokens = tokenize_search_query(query);
        let mut exclude_next = false;

        for token in tokens {
            if token.eq_ignore_ascii_case("AND") || token == "(" || token == ")" {
                continue;
            }
            if token.eq_ignore_ascii_case("OR") {
                parsed.unsupported_qualifiers.push("OR".to_string());
                continue;
            }
            if token.eq_ignore_ascii_case("NOT") {
                exclude_next = true;
                continue;
            }

            let (target, value) = if let Some((target, value)) = token.split_once(':') {
                (
                    Some(target.to_ascii_lowercase()),
                    value.trim_matches('"').to_string(),
                )
            } else {
                (None, token.trim_matches('"').to_string())
            };

            match target.as_deref() {
                Some("repo") => parsed.repo = Some(value.to_ascii_lowercase()),
                Some("user") => parsed.user = Some(value.to_ascii_lowercase()),
                Some("org") => parsed.org = Some(value.to_ascii_lowercase()),
                Some("is") if value.eq_ignore_ascii_case("fork") => {
                    parsed.is_fork = Some(!exclude_next);
                    exclude_next = false;
                }
                Some("language" | "path" | "symbol" | "content" | "license" | "enterprise") => {
                    parsed.unsupported_qualifiers.push(format!(
                        "{}:{}",
                        target.as_deref().unwrap(),
                        value
                    ));
                    exclude_next = false;
                }
                Some(_) => parsed.terms.push(value.to_ascii_lowercase()),
                None => {
                    if exclude_next {
                        parsed.excluded_terms.push(value.to_ascii_lowercase());
                        exclude_next = false;
                    } else if value.starts_with('/') && value.ends_with('/') && value.len() > 1 {
                        parsed.regex_terms.push(value.trim_matches('/').to_string());
                    } else if token.starts_with('"') && token.ends_with('"') {
                        parsed.exact_terms.push(value.to_ascii_lowercase());
                    } else {
                        parsed.terms.push(value.to_ascii_lowercase());
                    }
                }
            }
        }

        parsed
    }

    pub(crate) fn matches_repository(&self, repo: &Repository) -> bool {
        if let Some(repo_filter) = &self.repo {
            if format!("{}/{}", repo.owner_handle, repo.name).to_ascii_lowercase() != *repo_filter {
                return false;
            }
        }
        if let Some(owner_filter) = &self.user {
            if repo.owner_handle.to_ascii_lowercase() != *owner_filter {
                return false;
            }
        }
        if let Some(org_filter) = &self.org {
            if repo.owner_handle.to_ascii_lowercase() != *org_filter {
                return false;
            }
        }
        if let Some(is_fork) = self.is_fork {
            if repo.source_repository_id.is_some() != is_fork {
                return false;
            }
        }

        let haystack = [
            repo.owner_handle.as_str(),
            repo.name.as_str(),
            repo.description.as_str(),
            repo.visibility.as_str(),
            repo.remote_server.as_deref().unwrap_or(""),
        ]
        .join(" ")
        .to_ascii_lowercase();
        self.matches_haystack(&haystack)
    }

    pub(crate) fn matches_user(&self, user: &User) -> bool {
        if let Some(owner_filter) = &self.user {
            if user.username.to_ascii_lowercase() != *owner_filter {
                return false;
            }
        }
        if self.repo.is_some() || self.org.is_some() {
            return false;
        }

        let haystack = format!("{} {}", user.username, user.display_name).to_ascii_lowercase();
        self.matches_haystack(&haystack)
    }

    fn matches_haystack(&self, haystack: &str) -> bool {
        if self
            .excluded_terms
            .iter()
            .any(|term| !term.is_empty() && haystack.contains(term))
        {
            return false;
        }
        self.terms
            .iter()
            .chain(self.exact_terms.iter())
            .filter(|term| !term.is_empty())
            .all(|term| haystack.contains(term))
            && self
                .regex_terms
                .iter()
                .filter(|term| !term.is_empty())
                .all(|term| Regex::new(term).is_ok_and(|regex| regex.is_match(haystack)))
    }
}

pub(crate) fn tokenize_search_query(query: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut escaped = false;

    for char in query.chars() {
        if escaped {
            current.push(char);
            escaped = false;
            continue;
        }
        if char == '\\' {
            escaped = true;
            current.push(char);
            continue;
        }
        if char == '"' {
            in_quotes = !in_quotes;
            current.push(char);
            continue;
        }
        if char.is_whitespace() && !in_quotes {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            continue;
        }
        if (char == '(' || char == ')') && !in_quotes {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push(char.to_string());
            continue;
        }
        current.push(char);
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}
