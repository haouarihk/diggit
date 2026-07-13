export type IssueSearchState = {
  inputValue: string;
  labels: string[];
  searchText: string;
  status: "closed" | "open" | null;
};

export type PullRequestSearchState = {
  inputValue: string;
  labels: string[];
  searchText: string;
  status: "closed" | "merged" | "open" | null;
};

export type ReleaseSearchState = {
  inputValue: string;
  isPrerelease: boolean;
  searchText: string;
  tag: string | null;
};

type IssueLikeStatus = "closed" | "merged" | "open";

type IssueLikeParsedState<TStatus extends IssueLikeStatus> = {
  labels: string[];
  status: TStatus | null;
  terms: string[];
};

export function buildListHref(
  path: string,
  params: Record<string, number | string | undefined | null>,
) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function getIssueSearchInput(
  rawQuery?: string,
  legacy?: { labels?: string; status?: string },
) {
  const normalized = rawQuery?.trim();
  if (normalized) {
    return normalized;
  }
  const labels = splitList(legacy?.labels);
  const status =
    legacy?.status?.trim() === "all"
      ? null
      : normalizeIssueStatus(legacy?.status) ?? "open";
  return serializeIssueLikeQuery({ labels, status, terms: [] });
}

export function parseIssueSearchQuery(
  rawQuery?: string,
  legacy?: { labels?: string; status?: string },
): IssueSearchState {
  const inputValue = getIssueSearchInput(rawQuery, legacy);
  const parsed = parseIssueLikeQuery(inputValue, ["open", "closed"]);
  return {
    inputValue,
    labels: parsed.labels,
    searchText: parsed.terms.join(" ").trim(),
    status: parsed.status,
  };
}

export function setIssueSearchStatusQuery(
  rawQuery: string | undefined,
  status: "closed" | "open" | null,
  legacy?: { labels?: string; status?: string },
) {
  const current = parseIssueLikeQuery(
    getIssueSearchInput(rawQuery, legacy),
    ["open", "closed"],
  );
  return serializeIssueLikeQuery({ ...current, status });
}

export function toggleIssueSearchLabelQuery(
  rawQuery: string | undefined,
  label: string,
  legacy?: { labels?: string; status?: string },
) {
  const current = parseIssueLikeQuery(
    getIssueSearchInput(rawQuery, legacy),
    ["open", "closed"],
  );
  return serializeIssueLikeQuery({
    ...current,
    labels: toggleValue(current.labels, label),
  });
}

export function getPullRequestSearchInput(rawQuery?: string) {
  const normalized = rawQuery?.trim();
  return normalized || "is:open";
}

export function parsePullRequestSearchQuery(
  rawQuery?: string,
): PullRequestSearchState {
  const inputValue = getPullRequestSearchInput(rawQuery);
  const parsed = parseIssueLikeQuery(inputValue, ["open", "closed", "merged"]);
  return {
    inputValue,
    labels: parsed.labels,
    searchText: parsed.terms.join(" ").trim(),
    status: parsed.status,
  };
}

export function setPullRequestSearchStatusQuery(
  rawQuery: string | undefined,
  status: "closed" | "merged" | "open" | null,
) {
  const current = parseIssueLikeQuery(getPullRequestSearchInput(rawQuery), [
    "open",
    "closed",
    "merged",
  ]);
  return serializeIssueLikeQuery({ ...current, status });
}

export function togglePullRequestSearchLabelQuery(
  rawQuery: string | undefined,
  label: string,
) {
  const current = parseIssueLikeQuery(getPullRequestSearchInput(rawQuery), [
    "open",
    "closed",
    "merged",
  ]);
  return serializeIssueLikeQuery({
    ...current,
    labels: toggleValue(current.labels, label),
  });
}

export function getReleaseSearchInput(rawQuery?: string) {
  return rawQuery?.trim() ?? "";
}

export function parseReleaseSearchQuery(
  rawQuery?: string,
): ReleaseSearchState {
  const inputValue = getReleaseSearchInput(rawQuery);
  const terms: string[] = [];
  let isPrerelease = false;
  let tag: string | null = null;

  for (const token of tokenizeQuery(inputValue)) {
    const qualifier = parseQualifier(token);
    if (!qualifier) {
      terms.push(stripQuotes(token));
      continue;
    }

    if (qualifier.key === "is") {
      const normalized = normalizeReleaseIsQualifier(qualifier.value);
      if (normalized === "pre-release") {
        isPrerelease = true;
        continue;
      }
    }

    if (qualifier.key === "tag") {
      if (qualifier.value) {
        tag = qualifier.value;
        continue;
      }
    }

    terms.push(stripQuotes(token));
  }

  return {
    inputValue,
    isPrerelease,
    searchText: terms.join(" ").trim(),
    tag,
  };
}

export function toggleReleasePrereleaseQuery(rawQuery: string | undefined) {
  const current = parseReleaseSearchQuery(rawQuery);
  return serializeReleaseSearchQuery({
    ...current,
    isPrerelease: !current.isPrerelease,
  });
}

export function toggleReleaseTagQuery(
  rawQuery: string | undefined,
  tag: string,
) {
  const current = parseReleaseSearchQuery(rawQuery);
  return serializeReleaseSearchQuery({
    ...current,
    tag: sameValue(current.tag, tag) ? null : tag,
  });
}

function parseIssueLikeQuery<TStatus extends IssueLikeStatus>(
  query: string,
  supportedStatuses: readonly TStatus[],
): IssueLikeParsedState<TStatus> {
  const terms: string[] = [];
  const labels: string[] = [];
  let status: TStatus | null = null;

  for (const token of tokenizeQuery(query)) {
    const qualifier = parseQualifier(token);
    if (!qualifier) {
      terms.push(stripQuotes(token));
      continue;
    }

    if (qualifier.key === "is") {
      const normalizedStatus = normalizeIssueLikeStatus(
        qualifier.value,
        supportedStatuses,
      );
      if (normalizedStatus) {
        status = normalizedStatus;
        continue;
      }
    }

    if (qualifier.key === "label") {
      if (qualifier.value) {
        labels.push(qualifier.value);
        continue;
      }
    }

    terms.push(stripQuotes(token));
  }

  return {
    labels: uniqueValues(labels),
    status,
    terms,
  };
}

function serializeIssueLikeQuery<TStatus extends IssueLikeStatus>(
  state: IssueLikeParsedState<TStatus>,
) {
  const tokens: string[] = [];
  if (state.status) {
    tokens.push(`is:${state.status}`);
  }
  for (const label of state.labels) {
    tokens.push(`label:${quoteValue(label)}`);
  }
  for (const term of state.terms) {
    tokens.push(quoteValue(term));
  }
  return tokens.join(" ").trim();
}

function serializeReleaseSearchQuery(state: ReleaseSearchState) {
  const tokens: string[] = [];
  if (state.isPrerelease) {
    tokens.push("is:pre-release");
  }
  if (state.tag) {
    tokens.push(`tag:${quoteValue(state.tag)}`);
  }
  if (state.searchText) {
    for (const token of tokenizeQuery(state.searchText)) {
      const stripped = stripQuotes(token);
      if (stripped) {
        tokens.push(quoteValue(stripped));
      }
    }
  }
  return tokens.join(" ").trim();
}

function tokenizeQuery(value: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function parseQualifier(token: string) {
  const separatorIndex = token.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  return {
    key: token.slice(0, separatorIndex).toLowerCase(),
    value: stripQuotes(token.slice(separatorIndex + 1)),
  };
}

function stripQuotes(value: string) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function quoteValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (!/[\s":]/.test(trimmed)) {
    return trimmed;
  }
  return `"${trimmed.replaceAll('"', '\\"')}"`;
}

function normalizeIssueStatus(value?: string) {
  return normalizeIssueLikeStatus(value, ["open", "closed"]);
}

function normalizeIssueLikeStatus<TStatus extends IssueLikeStatus>(
  value: string | undefined,
  supportedStatuses: readonly TStatus[],
) {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  const alias = normalized === "close" ? "closed" : normalized;
  return supportedStatuses.includes(alias as TStatus) ? (alias as TStatus) : null;
}

function normalizeReleaseIsQualifier(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "pre-release" || normalized === "prerelease") {
    return "pre-release";
  }
  return null;
}

function splitList(value?: string) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function toggleValue(values: string[], nextValue: string) {
  return values.some((value) => sameValue(value, nextValue))
    ? values.filter((value) => !sameValue(value, nextValue))
    : [...values, nextValue];
}

function sameValue(left: string | null, right: string) {
  return left?.toLowerCase() === right.toLowerCase();
}

function uniqueValues(values: string[]) {
  return values.filter(
    (value, index) => values.findIndex((entry) => sameValue(entry, value)) === index,
  );
}
