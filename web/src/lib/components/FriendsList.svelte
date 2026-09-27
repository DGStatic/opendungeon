<script lang="ts">
  import { getMediaUrl, type APIFriend } from "$lib/api";
  import { getInitials } from "$lib/utils";
  import Icon from "@iconify/svelte";
  import { Avatar } from "melt/components";

  export type FriendAction = {
    icon: string;
    /** Tailwind text color class, e.g. "text-danger" */
    color: string;
    onclick: (index: number) => void;
  };

  type Props = {
    label: string;
    friends: APIFriend[];
    actions: FriendAction[];
    emptyText: string;
  };

  let { label, friends, actions, emptyText }: Props = $props();
</script>

<div class="relative min-h-24 max-h-48">
  <h2>{label}</h2>
  {#if friends.length > 0}
    <div class="p-4 flex flex-col gap-4 overflow-y-auto rounded-sm max-h-40">
      <ul class="flex flex-col gap-4 items-start">
        {#each friends as friend, i (i)}
          <li
            class="text-white flex flex-row items-center justify-between lg:justify-center w-full group/friend gap-2 md:gap-4 md:pr-4"
          >
            <div class="flex flex-row gap-2 items-center w-48 bg-aurora-gray-1200 p-2 rounded-md">
              <div
                class="flex w-10 h-10 bg-aurora-gray-1400 rounded-full text-center items-center justify-center"
              >
                <Avatar src={!friend.profile.avatarId ? "" : getMediaUrl(friend.profile.avatarId)}>
                  {#snippet children(avatar)}
                    <img {...avatar.image} alt="Avatar" class="w-full-h-full rounded-full" />
                    <span {...avatar.fallback} class="text-lg">
                      {getInitials(friend.profile.username)}
                    </span>
                  {/snippet}
                </Avatar>
              </div>
              <h3 class="text-md">{friend.profile.username}</h3>
            </div>
            {#each actions as action, j (j)}
              <button onclick={() => action.onclick(i)} class="size-8 group/delete duration-150">
                <Icon
                  icon={action.icon}
                  width={28}
                  height={28}
                  class="{action.color} duration-150 size-full p-1 hover:p-0"
                />
              </button>
            {/each}
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <span class="text-aurora-gray-800 absolute self-center top-0 bottom-0 left-0 right-0"
      >{emptyText}</span
    >
  {/if}
</div>
