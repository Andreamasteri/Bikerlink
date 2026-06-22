import { SensorScreen } from "@/components/admin/sensors/sensor-screen";

export default function MagnetometerUncalibratedScreen() {
  return (
    <SensorScreen
      def={{
        key: "magnetometerUncalibrated",
        name: "Magnetometer Uncalibrated",
        platform: "android",
        defaultConfig: '{"interval": 500}',
      }}
    />
  );
}
