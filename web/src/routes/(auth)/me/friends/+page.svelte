<script lang="ts">
  import { callAPI } from "$lib/api";
  import StyledButton from "$lib/components/StyledButton.svelte";
  import StyledCard from "$lib/components/StyledCard.svelte";
  import StyledInput from "$lib/components/StyledInput.svelte";
  import StyledMain from "$lib/components/StyledMain.svelte";
  import { addToast } from "$lib/components/Toaster.svelte";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  $effect(() => console.log(data.friends))

  let friends = $derived(data.friends?.filter((f) => f.confirmed) ?? []);
  let pendingInvites = $derived(
    data.friends?.filter((f) => !f.confirmed && f.initiatorID === data.profile.id) ?? [],
  );
  let incomingRequests = $derived(
    data.friends?.filter((f) => !f.confirmed && f.initiatorID !== data.profile.id) ?? [],
  );
  let username = $state("");

  async function handleInviteFriend(event: SubmitEvent) {
    event.preventDefault();

    const body = new FormData();
    body.append("username", username);

    const res = await callAPI(fetch, "POST", "/friends", { body });
    if (!res.ok) {
      addToast({
        data: { title: "Invite Failed", description: res.error.message, level: "danger" },
      });
      return;
    }

    username = "";
  }
</script>

<svelte:head>
  <title>Friends - OpenDungeon</title>
</svelte:head>

<StyledMain>
  <StyledCard class="max-w-96 w-full px-4 py-6 grid gap-6 md:px-8">
    <form onsubmit={handleInviteFriend} class="flex flex-col gap-2">
      <h2>Invite Friend</h2>
      <div class="flex flex-row gap-2">
        <StyledInput bind:value={username} placeholder="Username" />
        <StyledButton label="Invite" class="px-2" />
      </div>
    </form>
    <div class="grid lg:grid-cols-3 text-center">
      <div>
        <h2>Friends</h2>
        <ul>
          {#each friends as friend, i (i)}
            <li>{friend.profile.username}</li>
          {/each}
        </ul>
      </div>
      <div>
        <h2>Pending</h2>
        <ul>
          {#each pendingInvites as invite, i (i)}
            <li>{invite.profile.username}</li>
          {/each}
        </ul>
      </div>
      <div>
        <h2>Incoming</h2>
        <ul>
          {#each incomingRequests as request, i (i)}
            <li>{request.profile.username}</li>
          {/each}
        </ul>
      </div>
    </div>
  </StyledCard>
</StyledMain>
