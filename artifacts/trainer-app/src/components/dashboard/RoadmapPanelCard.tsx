/** „Wkrótce w Optimatren” na pulpicie trenera (flaga ROADMAP_ENABLED; przy wyłączonej nic nie pokazuje). */
import { RoadmapCard } from "@workspace/design-tokens/brand";
import { useRoadmap, useRoadmapStatus, useRoadmapVote } from "@/lib/adminApi";

export function RoadmapPanelCard() {
  const status = useRoadmapStatus();
  const on = status.data?.enabled === true;
  const list = useRoadmap(on);
  const vote = useRoadmapVote();
  if (!on || !list.data?.items?.length) return null;
  return <RoadmapCard items={list.data.items} busyId={vote.isPending ? vote.variables?.id ?? null : null} onToggle={(i) => vote.mutate({ id: i.id, voted: i.voted })} />;
}
