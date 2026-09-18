import { loadControlState } from "@/lib/control-state";
import { ControlCenter } from "./components/ControlCenter";

export const dynamic = "force-dynamic";

export default async function ControlCenterPage() {
  return <ControlCenter initialState={await loadControlState()} />;
}
