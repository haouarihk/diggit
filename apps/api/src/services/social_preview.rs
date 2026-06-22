use base64::{Engine as _, engine::general_purpose};
use resvg::usvg::{Options, Tree};
use tiny_skia::{Pixmap, Transform};

use crate::error::{ApiError, ApiResult};

pub(crate) const SOCIAL_PREVIEW_WIDTH: u32 = 1200;
pub(crate) const SOCIAL_PREVIEW_HEIGHT: u32 = 630;

#[derive(Debug, Clone)]
pub(crate) struct SocialPreviewData {
    pub(crate) owner: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) avatar_fallback: String,
    pub(crate) website_label: String,
    pub(crate) stats: Vec<SocialPreviewStat>,
}

#[derive(Debug, Clone)]
pub(crate) struct SocialPreviewStat {
    pub(crate) kind: SocialPreviewStatKind,
    pub(crate) label: String,
    pub(crate) value: i64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum SocialPreviewStatKind {
    Contributors,
    Issues,
    PullRequests,
    Discussions,
    Stars,
    Forks,
    Repositories,
    Members,
    Comments,
    Activity,
}

pub(crate) struct SocialPreviewRenderInput<'a> {
    pub(crate) data: &'a SocialPreviewData,
    pub(crate) avatar_data_uri: Option<&'a str>,
}

pub(crate) fn render_social_preview_png(input: SocialPreviewRenderInput<'_>) -> ApiResult<Vec<u8>> {
    let svg = social_preview_svg(input);
    let mut options = Options::default();
    options.fontdb_mut().load_system_fonts();
    let tree = Tree::from_str(&svg, &options).map_err(|error| {
        ApiError::BadRequest(format!("failed to parse social preview SVG: {error}"))
    })?;
    let mut pixmap = Pixmap::new(SOCIAL_PREVIEW_WIDTH, SOCIAL_PREVIEW_HEIGHT).ok_or_else(|| {
        ApiError::BadRequest("failed to allocate social preview image".to_string())
    })?;

    resvg::render(&tree, Transform::identity(), &mut pixmap.as_mut());
    pixmap.encode_png().map_err(|error| {
        ApiError::BadRequest(format!("failed to encode social preview PNG: {error}"))
    })
}

pub(crate) fn avatar_data_uri(content_type: &str, bytes: &[u8]) -> Option<String> {
    if !content_type.starts_with("image/") || bytes.is_empty() {
        return None;
    }

    Some(format!(
        "data:{};base64,{}",
        content_type,
        general_purpose::STANDARD.encode(bytes)
    ))
}

fn social_preview_svg(input: SocialPreviewRenderInput<'_>) -> String {
    let data = input.data;
    let owner_label = if data.owner.contains('/') {
        shorten(&data.owner, 48)
    } else {
        shorten(&format!("{} /", data.owner.trim()), 48)
    };
    let owner = escape_xml(&owner_label);
    let title = escape_xml(&shorten(&data.title, 34));
    let description_lines = wrap_text(
        if data.description.trim().is_empty() {
            "No description provided."
        } else {
            data.description.trim()
        },
        84,
        2,
    );
    let website_label = escape_xml(&shorten(&data.website_label, 24));
    let avatar_fallback = escape_xml(&shorten(&data.avatar_fallback, 3).to_uppercase());

    let description_svg = description_lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            format!(
                r##"<text x="86" y="{}" fill="#59636e" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="500">{}</text>"##,
                278 + index * 38,
                escape_xml(line)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let stats_svg = stats_svg(&data.stats);
    let avatar_svg = avatar_svg(input.avatar_data_uri, &avatar_fallback);

    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{SOCIAL_PREVIEW_WIDTH}" height="{SOCIAL_PREVIEW_HEIGHT}" viewBox="0 0 {SOCIAL_PREVIEW_WIDTH} {SOCIAL_PREVIEW_HEIGHT}">
  <defs>
    <linearGradient id="cardGradient" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f6f8fa"/>
    </linearGradient>
    <clipPath id="avatarClip"><circle cx="990" cy="190" r="88"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#cardGradient)"/>
  <circle cx="1035" cy="105" r="140" fill="#ddf4ff" opacity="0.55"/>
  <circle cx="170" cy="535" r="170" fill="#dafbe1" opacity="0.45"/>

  <g transform="translate(86 90)">
    <rect x="0" y="0" width="42" height="42" rx="11" fill="#1f883d"/>
    <path d="M14 12h16v6h-9v6h8v6H14z" fill="#ffffff"/>
    <text x="56" y="28" fill="#59636e" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">{website_label}</text>
  </g>

  <text x="86" y="177" fill="#59636e" font-family="Arial, Helvetica, sans-serif" font-size="33" font-weight="700">{owner}</text>
  <text x="86" y="236" fill="#1f2328" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="800">{title}</text>
  {description_svg}

  {avatar_svg}

  <rect x="86" y="428" width="1028" height="1" fill="#d8dee4"/>
  <g transform="translate(86 468)">
    {stats_svg}
  </g>
</svg>"##
    )
}

fn avatar_svg(avatar_data_uri: Option<&str>, fallback: &str) -> String {
    if let Some(data_uri) = avatar_data_uri {
        return format!(
            r##"<circle cx="990" cy="190" r="92" fill="#ffffff" stroke="#d0d7de" stroke-width="4"/>
  <image x="902" y="102" width="176" height="176" href="{}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>"##,
            escape_xml(data_uri)
        );
    }

    format!(
        r##"<circle cx="990" cy="190" r="92" fill="#f6f8fa" stroke="#d0d7de" stroke-width="4"/>
  <text x="990" y="213" fill="#24292f" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="800" text-anchor="middle">{fallback}</text>"##
    )
}

fn stats_svg(stats: &[SocialPreviewStat]) -> String {
    let max_stats = 6_usize;
    let gap = 170_i32;

    stats
        .iter()
        .take(max_stats)
        .enumerate()
        .map(|(index, stat)| {
            let x = index as i32 * gap;
            let value = escape_xml(&compact_number(stat.value));
            let label = escape_xml(&shorten(&stat.label, 18));
            let icon = stat_icon(stat.kind);
            format!(
                r##"<g transform="translate({x} 0)">
      {icon}
      <text x="46" y="18" fill="#1f2328" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800">{value}</text>
      <text x="46" y="49" fill="#59636e" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600">{label}</text>
    </g>"##
            )
        })
        .collect::<Vec<_>>()
        .join("")
}

fn stat_icon(kind: SocialPreviewStatKind) -> &'static str {
    match kind {
        SocialPreviewStatKind::Contributors => {
            r##"<circle cx="10" cy="12" r="7" fill="#0969da"/><circle cx="23" cy="16" r="6" fill="#54aeff"/><path d="M0 34c1-10 19-10 20 0" fill="none" stroke="#0969da" stroke-width="4" stroke-linecap="round"/><path d="M14 35c2-8 18-8 20 0" fill="none" stroke="#54aeff" stroke-width="4" stroke-linecap="round"/>"##
        }
        SocialPreviewStatKind::Issues => {
            r##"<circle cx="16" cy="18" r="13" fill="none" stroke="#1a7f37" stroke-width="4"/><circle cx="16" cy="18" r="4" fill="#1a7f37"/>"##
        }
        SocialPreviewStatKind::PullRequests => {
            r##"<circle cx="8" cy="9" r="5" fill="none" stroke="#8250df" stroke-width="4"/><circle cx="26" cy="34" r="5" fill="none" stroke="#8250df" stroke-width="4"/><path d="M8 14v20h13" fill="none" stroke="#8250df" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 27l6 7-6 7" fill="none" stroke="#8250df" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>"##
        }
        SocialPreviewStatKind::Discussions => {
            r##"<path d="M4 7h28v20H17l-8 8v-8H4z" fill="none" stroke="#bf8700" stroke-width="4" stroke-linejoin="round"/><path d="M11 16h15M11 23h9" stroke="#bf8700" stroke-width="4" stroke-linecap="round"/>"##
        }
        SocialPreviewStatKind::Stars => {
            r##"<path d="M18 3l4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3L18 26.7 8.7 31.5l1.8-10.3L3 13.9l10.4-1.5z" fill="none" stroke="#bf8700" stroke-width="4" stroke-linejoin="round"/>"##
        }
        SocialPreviewStatKind::Forks => {
            r##"<circle cx="8" cy="8" r="5" fill="none" stroke="#59636e" stroke-width="4"/><circle cx="28" cy="8" r="5" fill="none" stroke="#59636e" stroke-width="4"/><circle cx="18" cy="34" r="5" fill="none" stroke="#59636e" stroke-width="4"/><path d="M8 13v6c0 6 4 9 10 9s10-3 10-9v-6M18 28v1" fill="none" stroke="#59636e" stroke-width="4" stroke-linecap="round"/>"##
        }
        SocialPreviewStatKind::Repositories => {
            r##"<rect x="4" y="4" width="25" height="32" rx="4" fill="none" stroke="#0969da" stroke-width="4"/><path d="M11 12h11M11 20h11M11 28h7" stroke="#0969da" stroke-width="4" stroke-linecap="round"/>"##
        }
        SocialPreviewStatKind::Members => {
            r##"<circle cx="17" cy="12" r="8" fill="none" stroke="#1a7f37" stroke-width="4"/><path d="M4 36c2-15 24-15 26 0" fill="none" stroke="#1a7f37" stroke-width="4" stroke-linecap="round"/>"##
        }
        SocialPreviewStatKind::Comments => {
            r##"<path d="M4 7h28v20H17l-8 8v-8H4z" fill="none" stroke="#0969da" stroke-width="4" stroke-linejoin="round"/><path d="M11 16h15M11 23h9" stroke="#0969da" stroke-width="4" stroke-linecap="round"/>"##
        }
        SocialPreviewStatKind::Activity => {
            r##"<path d="M5 20h8l5-12 8 25 5-13h6" fill="none" stroke="#8250df" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>"##
        }
    }
}

fn wrap_text(value: &str, max_chars: usize, max_lines: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();

    for word in value.split_whitespace() {
        let candidate_len = if current.is_empty() {
            word.len()
        } else {
            current.len() + 1 + word.len()
        };

        if candidate_len > max_chars && !current.is_empty() {
            lines.push(current);
            current = String::new();
            if lines.len() == max_lines {
                break;
            }
        }

        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(word);
    }

    if lines.len() < max_lines && !current.is_empty() {
        lines.push(current);
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    if lines.len() == max_lines {
        if let Some(last) = lines.last_mut() {
            *last = shorten(last, max_chars);
        }
    }

    lines
}

fn shorten(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }

    let keep = max_chars.saturating_sub(1);
    let mut shortened = trimmed.chars().take(keep).collect::<String>();
    shortened.push_str("...");
    shortened
}

fn compact_number(value: i64) -> String {
    let abs = value.abs();
    if abs >= 1_000_000 {
        format!("{:.1}M", value as f64 / 1_000_000.0)
    } else if abs >= 1_000 {
        format!("{:.1}K", value as f64 / 1_000.0)
    } else {
        value.to_string()
    }
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_data() -> SocialPreviewData {
        SocialPreviewData {
            owner: "diggit".to_string(),
            title: "web".to_string(),
            description: "Federated Git hosting for cross-server forks and pull requests."
                .to_string(),
            avatar_url: None,
            avatar_fallback: "DG".to_string(),
            website_label: "Diggit".to_string(),
            stats: vec![
                SocialPreviewStat {
                    kind: SocialPreviewStatKind::Contributors,
                    label: "Contributors".to_string(),
                    value: 12,
                },
                SocialPreviewStat {
                    kind: SocialPreviewStatKind::Issues,
                    label: "Issues".to_string(),
                    value: 4,
                },
                SocialPreviewStat {
                    kind: SocialPreviewStatKind::Stars,
                    label: "Stars".to_string(),
                    value: 1532,
                },
            ],
        }
    }

    #[test]
    fn renderer_outputs_png_with_expected_dimensions() {
        let png = render_social_preview_png(SocialPreviewRenderInput {
            data: &sample_data(),
            avatar_data_uri: None,
        })
        .expect("preview should render");

        assert_eq!(&png[0..8], b"\x89PNG\r\n\x1a\n");
        assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), 1200);
        assert_eq!(u32::from_be_bytes(png[20..24].try_into().unwrap()), 630);
    }

    #[test]
    fn svg_escapes_user_controlled_text() {
        let mut data = sample_data();
        data.owner = "acme & sons".to_string();
        data.title = "<script>".to_string();
        data.description = "\"quoted\" repository".to_string();

        let svg = social_preview_svg(SocialPreviewRenderInput {
            data: &data,
            avatar_data_uri: None,
        });

        assert!(svg.contains("acme &amp; sons"));
        assert!(svg.contains("&lt;script&gt;"));
        assert!(svg.contains("&quot;quoted&quot; repository"));
        assert!(!svg.contains("<script>"));
    }
}
