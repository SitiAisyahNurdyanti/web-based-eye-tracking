// Demo region pandangan (real-time). Dibuka lewat tombol "Coba Demo Region"
// setelah test grid, di tab yang sama dengan kalibrasinya:
//   /gaze-demo?cal=<session_id kalibrasi>&pid=P01
import GazeRegionDemo from "@/components/GazeRegionDemo";

type GazeDemoPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function GazeDemoPage({ searchParams }: GazeDemoPageProps) {
  const sp = await searchParams;
  return <GazeRegionDemo calSessionId={first(sp.cal) ?? ""} participantId={first(sp.pid)} />;
}
