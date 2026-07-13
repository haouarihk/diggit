import { component$ } from "@builder.io/qwik";

import type { RepositoryCommit } from "~/lib/api";

type CommitCompareListProps = {
  commits: RepositoryCommit[];
  emptyLabel: string;
  title: string;
};

export const CommitCompareList = component$(
  ({ commits, emptyLabel, title }: CommitCompareListProps) => {
    return (
      <section class="compare-commits">
        <header class="compare-commits__header">
          <h3 class="compare-commits__title">{title}</h3>
        </header>
        {commits.length === 0 ? (
          <p class="compare-commits__empty">{emptyLabel}</p>
        ) : (
          commits.map((commit) => (
            <article class="compare-commits__item" key={commit.sha}>
              <div class="compare-commits__message">{commit.message}</div>
              <div class="compare-commits__meta">
                <span>{commit.author_name}</span>
                <span>{formatDate(commit.created_at)}</span>
                <span class="compare-commits__sha">{commit.sha.slice(0, 12)}</span>
              </div>
            </article>
          ))
        )}
      </section>
    );
  },
);

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
