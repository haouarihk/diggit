"use client";

import { useState } from "react";

export function OrganizationFollowButton() {
  const [isFollowing, setIsFollowing] = useState(false);

  return (
    <button
      aria-pressed={isFollowing}
      className="cursor-pointer rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 font-semibold hover:border-[#0969da] hover:text-[#0969da]"
      type="button"
      onClick={() => setIsFollowing((value) => !value)}
    >
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
