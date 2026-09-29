<script lang="ts">
  import { GameMenuToolIcon } from "$lib/game";
    import type { GameTools } from "$lib/game/gameTools.svelte";
  import Icon from "@iconify/svelte";

  type Props = {
    toolData: GameTools;
  };

  let { toolData }: Props = $props();
  const gameTools = [
    { type: "select", icon: GameMenuToolIcon.Select },
    { type: "measure", icon: GameMenuToolIcon.Measure },
    { type: "shape", icon: GameMenuToolIcon.Shape },
    { type: "draw", icon: GameMenuToolIcon.Draw },
    { type: "dice", icon: GameMenuToolIcon.Dice },
  ];
</script>

<div class="absolute top-32 left-6 z-10 flex flex-row gap-4">
  <ul class="flex flex-col gap-4">
    {#each gameTools as tool, i (i)}
      <li>
        <button
          data-active={toolData.activeTool === tool}
          onpointerdown={() => {
            if (toolData.activeTool?.type === tool.type) {
              toolData.activeTool = null;
            } else {
              toolData.activeTool = tool
            }
          }}
          class="p-2 bg-aurora-gray-1200 hover:bg-aurora-gray-1000 active:bg-aurora-gray-800 data-[active=true]:bg-aurora-gray-800 border-2 border-aurora-gray-400 duration-150 rounded-md"
        >
          <span class="sr-only">{tool.type}</span>
          <Icon icon={tool.icon} width={24} height={24} />
        </button>
      </li>
    {/each}
  </ul>
  {#if toolData.activeTool?.type === "select"}
    <!-- TODO: implement tool options -->
    <div class="bg-aurora-gray-1400 border-2 border-aurora-gray-400 rounded-sm p-2 w-2xs"></div>
  {/if}
</div>
