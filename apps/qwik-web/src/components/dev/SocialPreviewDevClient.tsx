import { component$, useSignal } from "@builder.io/qwik";
import { publicApiBaseUrl } from "~/lib/api";

type PreviewFields = {
  preview_type: "repository" | "issue" | "pull_request";
  owner: string;
  title: string;
  description: string;
  avatar_url: string;
  avatar_fallback: string;
  website_label: string;
  number: string;
  status: string;
  comments: string;
  activity: string;
  source_branch: string;
  target_branch: string;
  contributors: string;
  issues: string;
  pull_requests: string;
  discussions: string;
  stars: string;
  forks: string;
};

type PreviewType = PreviewFields["preview_type"];

const previewDefaults: Record<PreviewType, Omit<PreviewFields, "preview_type">> = {
  repository: {
    owner: "acme",
    title: "rocket-launcher",
    description:
      "A polished repository preview card generated on demand by the Rust backend.",
    avatar_url: "",
    avatar_fallback: "AC",
    website_label: "Diggit",
    number: "42",
    status: "open",
    comments: "9",
    activity: "14",
    source_branch: "feature/social-previews",
    target_branch: "main",
    contributors: "24",
    issues: "7",
    pull_requests: "3",
    discussions: "0",
    stars: "1342",
    forks: "86",
  },
  issue: {
    owner: "acme/rocket-launcher",
    title: "Improve repository previews",
    description:
      "Issue preview cards should show title, author context, comments, and activity.",
    avatar_url: "",
    avatar_fallback: "AC",
    website_label: "Diggit",
    number: "42",
    status: "open",
    comments: "9",
    activity: "14",
    source_branch: "feature/social-previews",
    target_branch: "main",
    contributors: "24",
    issues: "7",
    pull_requests: "3",
    discussions: "0",
    stars: "1342",
    forks: "86",
  },
  pull_request: {
    owner: "acme/rocket-launcher",
    title: "Add social preview cards",
    description: "Open pull request from feature/social-previews into main.",
    avatar_url: "",
    avatar_fallback: "AC",
    website_label: "Diggit",
    number: "17",
    status: "open",
    comments: "5",
    activity: "8",
    source_branch: "feature/social-previews",
    target_branch: "main",
    contributors: "24",
    issues: "7",
    pull_requests: "3",
    discussions: "0",
    stars: "1342",
    forks: "86",
  },
};

const initialFields: PreviewFields = {
  preview_type: "repository",
  ...previewDefaults.repository,
};

const fieldLabels: Array<{ key: keyof PreviewFields; label: string; type?: string }> = [
  { key: "owner", label: "Owner or organization" },
  { key: "title", label: "Repository or profile title" },
  { key: "description", label: "Description" },
  { key: "avatar_url", label: "Avatar URL" },
  { key: "avatar_fallback", label: "Avatar fallback" },
  { key: "website_label", label: "Website label" },
  { key: "number", label: "Issue/PR number", type: "number" },
  { key: "status", label: "Issue/PR status" },
  { key: "comments", label: "Comments", type: "number" },
  { key: "activity", label: "Activity", type: "number" },
  { key: "source_branch", label: "PR source branch" },
  { key: "target_branch", label: "PR target branch" },
  { key: "contributors", label: "Contributors", type: "number" },
  { key: "issues", label: "Issues", type: "number" },
  { key: "pull_requests", label: "Pull requests", type: "number" },
  { key: "discussions", label: "Discussions", type: "number" },
  { key: "stars", label: "Stars", type: "number" },
  { key: "forks", label: "Forks", type: "number" },
];

export const SocialPreviewDevClient = component$(() => {
  const fields = useSignal(initialFields);
  const imageSrc = previewImageSrc(fields.value);

  return (
    <div class="social-preview-dev">
      <section class="social-preview-dev__intro">
        <h1 class="social-preview-dev__title">Social preview tester</h1>
        <p class="social-preview-dev__description">
          Adjust the dummy values below to regenerate the Rust backend preview
          image.
        </p>
      </section>

      <div class="social-preview-dev__grid">
        <section class="social-preview-dev__controls">
          <label class="settings-drawer-form__label">
            <span class="settings-drawer-form__heading">Preview type</span>
            <select
              class="settings-drawer-form__input"
              value={fields.value.preview_type}
              onChange$={(event) => {
                const previewType = (event.target as HTMLSelectElement)
                  .value as PreviewType;
                fields.value = {
                  preview_type: previewType,
                  ...previewDefaults[previewType],
                };
              }}
            >
              <option value="repository">Repository</option>
              <option value="issue">Issue</option>
              <option value="pull_request">Pull request</option>
            </select>
          </label>
          {fieldLabels.map((field) => (
            <label class="settings-drawer-form__label" key={field.key}>
              <span class="settings-drawer-form__heading">{field.label}</span>
              {field.key === "description" ? (
                <textarea
                  class="settings-drawer-form__textarea settings-drawer-form__textarea--plain"
                  value={fields.value[field.key]}
                  onInput$={(event) => {
                    fields.value = {
                      ...fields.value,
                      [field.key]: (event.target as HTMLTextAreaElement).value,
                    };
                  }}
                />
              ) : (
                <input
                  class="settings-drawer-form__input"
                  min={field.type === "number" ? 0 : undefined}
                  type={field.type ?? "text"}
                  value={fields.value[field.key]}
                  onInput$={(event) => {
                    fields.value = {
                      ...fields.value,
                      [field.key]: (event.target as HTMLInputElement).value,
                    };
                  }}
                />
              )}
            </label>
          ))}
        </section>

        <section class="social-preview-dev__preview">
          <div>
            <h2 class="social-preview-dev__preview-title">Generated image</h2>
            <p class="social-preview-dev__description">
              1200 x 630 PNG from the backend debug route.
            </p>
          </div>
          <img
            alt="Generated social preview"
            class="social-preview-dev__image"
            height={630}
            src={imageSrc}
            width={1200}
          />
          <a
            class="social-preview-dev__link"
            href={imageSrc}
            rel="noreferrer"
            target="_blank"
          >
            {imageSrc}
          </a>
        </section>
      </div>
    </div>
  );
});

function previewImageSrc(fields: PreviewFields) {
  const params = new URLSearchParams();

  Object.entries(fields).forEach(([key, value]) => {
    if (value.trim()) {
      params.set(key, value.trim());
    }
  });
  params.set("preview_cache_bust", "2");

  return `${publicApiBaseUrl()}/dev/social-preview.png?${params.toString()}`;
}
