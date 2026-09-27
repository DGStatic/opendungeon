<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { type APIFriend, type APIGame, type APILevelMetaData, type APIProfile } from "$lib/api";
  import { getSimplifiedTimeSince } from "$lib/utils";
  import Icon from "@iconify/svelte";
  import StyledButton from "./StyledButton.svelte";
  import StyledCard from "./StyledCard.svelte";
  import StyledInput from "./StyledInput.svelte";
  import type { ClassValue } from "svelte/elements";
  import ProfileList from "./ProfileList.svelte";

  type Props = {
    profile: APIProfile;
    creatingGame: boolean;
    activeGame: APIGame | null;
    activeLevel: APILevelMetaData | null;
    friends: APIFriend[];
    handleCreateGame: (event: SubmitEvent) => void;
    handleDeleteGame: () => void;
    handleDeleteLevel: () => void;
    handleAddPlayer: (index: number) => Promise<boolean>;
    onClose: () => void;
    class?: ClassValue;
  };

  let {
    profile,
    creatingGame,
    activeGame,
    activeLevel,
    friends,
    handleCreateGame,
    handleDeleteGame,
    handleDeleteLevel,
    handleAddPlayer,
    onClose,
    class: customClass,
  }: Props = $props();

  let gameName = $state("");
  let showAddBar = $state(false);
  let showConfirmation = $state(false);

  $effect(() => {
    void activeGame;
    void activeLevel;

    showAddBar = false;
    showConfirmation = false;
  });
</script>

<StyledCard
  class={[
    "mx-auto h-fit px-4 pb-6 pt-10 flex flex-col justify-start gap-4 md:gap-8 md:w-70",
    customClass,
  ]}
>
  <button class="absolute top-2 right-2 p-1" onclick={onClose}
    ><Icon icon="bytesize:close" width={18} height={18} /></button
  >
  {#if creatingGame}
    <form
      class="flex flex-col gap-8"
      onsubmit={(event) => {
        gameName = "";
        handleCreateGame(event);
      }}
    >
      <StyledInput bind:value={gameName} name="name" placeholder="Game name" autocomplete="off" />
      <StyledButton label="Create Game" />
    </form>
  {:else if activeGame}
    <div>
      <h3 class="text-xl wrap-break-word">{activeGame.name}</h3>
      <span class="text-aurora-gray-600">
        Created by {activeGame.profiles.find((profile) => profile.id === activeGame?.gameMasterId)
          ?.username}
      </span>
    </div>

    <div class="flex flex-col gap-3">
      <div class="flex justify-between">
        <h4 class="text-lg">Players</h4>
        {#if profile.id === activeGame.gameMasterId}
          <button
            onclick={() => {
              showAddBar = !showAddBar;
            }}
            class="bg-aurora-gray-1000 hover:bg-aurora-gray-800 rounded px-2"
            >{`${showAddBar ? "Cancel" : "Add"}`}</button
          >
        {/if}
      </div>
      {#if showAddBar}
        <ProfileList
          profiles={friends.map((friend) => friend.profile)}
          emptyText="No friends to add..."
          actions={[
            {
              icon: "akar-icons:person-add",
              color: "text-success",
              onclick: handleAddPlayer,
            },
          ]}
          class="border border-aurora-gray-1000 rounded items-center"
        />
      {/if}
      <ProfileList profiles={activeGame.profiles} class="border border-aurora-gray-1000 rounded" />
    </div>
    <div class="flex flex-col gap-2">
      <StyledButton label="Join Game" onclick={() => goto(resolve(`/games/${activeGame!.id}`))} />
      {#if profile.id === activeGame.gameMasterId}
        <div class="flex gap-2">
          {#if showConfirmation}
            <StyledButton
              class={` ${showConfirmation ? "flex-1" : ""}`}
              onclick={() => (showConfirmation = false)}
              label="Cancel"
            />
          {/if}
          <button
            class={`justify-items-center cursor-pointer rounded-lg py-2 text-center  border border-aurora-gray-800 bg-danger/50 hover:bg-danger ${showConfirmation ? "flex-1" : "flex-2"}`}
            onclick={() => {
              if (showConfirmation) {
                handleDeleteGame();
              } else {
                showConfirmation = true;
              }
            }}
          >
            {showConfirmation ? "Confirm" : "Delete Game"}
          </button>
        </div>
      {/if}
    </div>
  {:else if activeLevel}
    <div>
      <h3 class="text-xl wrap-break-word">{activeLevel.name}</h3>
      <span class="text-aurora-gray-600"
        >{`${activeLevel.updatedAt !== activeLevel.createdAt ? "Updated" : "Created"} ${getSimplifiedTimeSince(activeLevel.updatedAt, Date.now() / 1000)}`}</span
      >
    </div>
    <div class="flex flex-col gap-2">
      <StyledButton
        label="Edit Level"
        onclick={() => goto(resolve(`/level-editor/${activeLevel!.id}`))}
      />
      <div class="flex gap-2">
        {#if showConfirmation}
          <StyledButton
            class={` ${showConfirmation ? "flex-1" : ""}`}
            onclick={() => (showConfirmation = false)}
            label="Cancel"
          />
        {/if}
        <button
          class={`grid justify-items-center cursor-pointer rounded-lg py-2 text-center border border-aurora-gray-800 bg-danger/50 hover:bg-danger ${showConfirmation ? "flex-1" : "flex-2"}`}
          onclick={() => {
            if (showConfirmation) {
              handleDeleteLevel();
            } else {
              showConfirmation = true;
            }
          }}
        >
          {showConfirmation ? "Confirm" : "Delete Level"}
        </button>
      </div>
    </div>
  {/if}
</StyledCard>
