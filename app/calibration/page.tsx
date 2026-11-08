// Kalibrasi 9 titik (HV9): grid 3x3.
import CalibrationSession from "@/components/CalibrationSession";
import { CALIBRATION_LAYOUTS } from "@/lib/eyetracking/config";

export default function CalibrationPage() {
  return <CalibrationSession layout={CALIBRATION_LAYOUTS.HV9} />;
}
