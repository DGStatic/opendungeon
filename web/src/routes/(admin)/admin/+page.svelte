<script lang="ts">
  import { callAPI } from "$lib/api";
  import StyledButton from "$lib/components/StyledButton.svelte";
  import StyledCard from "$lib/components/StyledCard.svelte";
  import StyledFileUpload from "$lib/components/StyledFileUpload.svelte";
  import StyledInput from "$lib/components/StyledInput.svelte";
  import StyledMain from "$lib/components/StyledMain.svelte";
  import { addToast } from "$lib/components/Toaster.svelte";
  import { FileUpload } from "melt/builders";

  let key = $state("");
  let displayName = $state("");
  let file: File | null = $state(null);
  const fileUpload = new FileUpload();

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    if (!file) {
      addToast({
        data: {
          title: "Asset Required",
          description: "You must select a texture image or decoration model.",
          level: "danger",
        },
      });
      return;
    }

    const body = new FormData();
    body.append("key", key);
    body.append("displayName", displayName);
    body.append("file", file);

    const res = await callAPI(
      fetch,
      "POST",
      file.type.includes("gltf") || file.type === ""
        ? "/admin/decorations"
        : "/admin/cell-textures",
      { body },
    );
    if (!res.ok) {
      addToast({
        data: { title: "Upload Failed", description: res.error.message, level: "danger" },
      });
      return;
    }

    key = "";
    displayName = "";
    file = null;
    fileUpload.remove(fileUpload.selected!);

    addToast({
      data: {
        title: "Success",
        description: "Successfully uploaded asset.",
        level: "success",
      },
    });
  }
</script>

<StyledMain>
  <StyledCard class="w-full h-full max-w-[800px] px-4 py-6 grid content-start gap-4 md:px-8">
    <h2>Upload Cell Texture or Decoration</h2>
    <form class="grid" onsubmit={handleSubmit}>
      <StyledInput bind:value={key} placeholder="Key (e.g. 'castle.rug.edge')" />
      <StyledInput bind:value={displayName} placeholder="Display Name" />
      <StyledFileUpload
        bind:value={file}
        {fileUpload}
        label="Asset"
        icon="material-symbols:image-outline-rounded"
      />
      <StyledButton label="Submit" />
    </form>
  </StyledCard>
</StyledMain>
