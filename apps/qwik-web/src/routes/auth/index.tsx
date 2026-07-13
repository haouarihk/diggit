import { $, component$, useSignal } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { authEndpoint } from "~/lib/api";

type AuthMode = "login" | "register";

export default component$(() => {
  const mode = useSignal<AuthMode>("login");
  const status = useSignal("");
  const isSubmitting = useSignal(false);

  const submit = $(async (event: SubmitEvent) => {
    event.preventDefault();
    if (!(event.currentTarget instanceof HTMLFormElement)) {
      return;
    }

    const form = new FormData(event.currentTarget);
    isSubmitting.value = true;
    status.value = "";

    try {
      const response = await fetch(authEndpoint(mode.value), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          display_name: form.get("display_name"),
          email: form.get("email"),
          password: form.get("password"),
          username: form.get("username"),
        }),
      });

      status.value = response.ok
        ? `${mode.value} request succeeded.`
        : `${mode.value} request failed with ${response.status}.`;
    } catch (error) {
      status.value =
        error instanceof Error ? error.message : "Request failed unexpectedly.";
    } finally {
      isSubmitting.value = false;
    }
  });

  return (
    <div className="stack">
      <section className="hero stack">
        <span className="eyebrow">Representative route: Auth</span>
        <h1>Authentication</h1>
        <p className="muted">
          This form posts directly to the Rust backend&apos;s auth endpoints.
        </p>
      </section>

      <section className="panel stack">
        <div className="grid grid--2">
          <button
            className={`button ${mode.value === "login" ? "" : "button--secondary"}`}
            onClick$={() => {
              mode.value = "login";
              status.value = "";
            }}
            type="button"
          >
            Login
          </button>
          <button
            className={`button ${mode.value === "register" ? "" : "button--secondary"}`}
            onClick$={() => {
              mode.value = "register";
              status.value = "";
            }}
            type="button"
          >
            Register
          </button>
        </div>

        <form className="grid" onSubmit$={submit}>
          {mode.value === "register" ? (
            <>
              <label className="label">
                Username
                <input className="control" name="username" required type="text" />
              </label>
              <label className="label">
                Display name
                <input
                  className="control"
                  name="display_name"
                  required
                  type="text"
                />
              </label>
            </>
          ) : null}

          <label className="label">
            Email
            <input className="control" name="email" required type="email" />
          </label>
          <label className="label">
            Password
            <input className="control" name="password" required type="password" />
          </label>

          <button className="button" disabled={isSubmitting.value} type="submit">
            {isSubmitting.value ? "Submitting..." : `Submit ${mode.value}`}
          </button>
        </form>

        {status.value ? <p className="muted">{status.value}</p> : null}
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Auth · Diggit Qwik Prototype",
};
