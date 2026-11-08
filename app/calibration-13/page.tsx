// Kalibrasi 13 titik (HV13): grid 3x3 + 4 titik di tengah antara pusat dan pojok.
import CalibrationSession from "@/components/CalibrationSession";
import { CALIBRATION_LAYOUTS } from "@/lib/eyetracking/config";

export default function Calibration13Page() {
  return <CalibrationSession layout={CALIBRATION_LAYOUTS.HV13} />;
}
