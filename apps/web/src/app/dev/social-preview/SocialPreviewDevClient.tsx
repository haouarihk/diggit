"use client";

import { publicApiBaseUrl } from "@/lib/runtime-config";
import { ChangeEvent, useState } from "react";

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
  description: "A polished repository preview card generated on demand by the Rust backend.",
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
    description: "Issue preview cards should show title, author context, comments, and activity.",
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

export function SocialPreviewDevClient() {
  const [fields, setFields] = useState(initialFields);
  const imageSrc = previewImageSrc(fields);

  function updateField(key: keyof PreviewFields) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (key === "preview_type") {
        const previewType = event.target.value as PreviewType;
        setFields({ preview_type: previewType, ...previewDefaults[previewType] });
        return;
      }
      setFields((current) => ({ ...current, [key]: event.target.value }));
    };
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-[#d0d7de] bg-white p-5">
        <h1 className="text-2xl font-semibold">Social preview tester</h1>
        <p className="mt-2 text-[#59636e]">
          Adjust the dummy values below to regenerate the Rust backend preview image.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="grid gap-4 rounded-md border border-[#d0d7de] bg-white p-4">
          <label className="grid gap-1.5">
            <span className="font-semibold">Preview type</span>
            <select
              className="rounded-md border border-[#d0d7de] px-3 py-2"
              onChange={updateField("preview_type")}
              value={fields.preview_type}
            >
              <option value="repository">Repository</option>
              <option value="issue">Issue</option>
              <option value="pull_request">Pull request</option>
            </select>
          </label>
          {fieldLabels.map((field) => (
            <label className="grid gap-1.5" key={field.key}>
              <span className="font-semibold">{field.label}</span>
              {field.key === "description" ? (
                <textarea
                  className="min-h-24 rounded-md border border-[#d0d7de] px-3 py-2"
                  onChange={updateField(field.key)}
                  value={fields[field.key]}
                />
              ) : (
                <input
                  className="rounded-md border border-[#d0d7de] px-3 py-2"
                  min={field.type === "number" ? 0 : undefined}
                  onChange={updateField(field.key)}
                  type={field.type ?? "text"}
                  value={fields[field.key]}
                />
              )}
            </label>
          ))}
        </section>

        <section className="grid content-start gap-4 rounded-md border border-[#d0d7de] bg-white p-4">
          <div>
            <h2 className="text-lg font-semibold">Generated image</h2>
            <p className="text-[#59636e]">1200 x 630 PNG from the backend debug route.</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Generated social preview"
            className="w-full rounded-xl"
            src={imageSrc}
          />
          <a className="break-all text-[#0969da] hover:underline" href={imageSrc} rel="noreferrer" target="_blank">
            {imageSrc}
          </a>
        </section>
      </div>
    </div>
  );
}

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
