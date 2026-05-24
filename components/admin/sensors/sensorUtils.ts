import {
  Accelerometer,
  Gyroscope,
  Magnetometer,
  MagnetometerUncalibrated,
  Barometer,
  DeviceMotion,
  Pedometer,
  LightSensor,
  DeviceSensor,
} from "expo-sensors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DeviceSensor generic type from expo-sensors
export type Subscription = ReturnType<DeviceSensor<any>["addListener"]>;

export type SensorKey =
  | "accelerometer"
  | "gyroscope"
  | "magnetometer"
  | "magnetometerUncalibrated"
  | "barometer"
  | "deviceMotion"
  | "pedometer"
  | "lightSensor";

export type SensorDefinition = {
  key: SensorKey;
  name: string;
  platform: "android" | "ios" | "cross";
  defaultConfig: string;
};

export function xyzFormat(d: { x: number; y: number; z: number }): string {
  return `x: ${d.x.toFixed(4)}, y: ${d.y.toFixed(4)}, z: ${d.z.toFixed(4)}`;
}

export async function requestSensorPermission(
  key: SensorKey
): Promise<{ granted: boolean; required: boolean; canAskAgain?: boolean }> {
  switch (key) {
    case "pedometer":
      const { status, canAskAgain } = await Pedometer.requestPermissionsAsync();
      return { granted: status === "granted", required: true, canAskAgain };
    default:
      return { granted: true, required: false };
  }
}

export async function checkSensorAvailable(key: SensorKey): Promise<boolean> {
  switch (key) {
    case "accelerometer":
      return Accelerometer.isAvailableAsync();
    case "gyroscope":
      return Gyroscope.isAvailableAsync();
    case "magnetometer":
      return Magnetometer.isAvailableAsync();
    case "magnetometerUncalibrated":
      return MagnetometerUncalibrated.isAvailableAsync();
    case "barometer":
      return Barometer.isAvailableAsync();
    case "deviceMotion":
      return DeviceMotion.isAvailableAsync();
    case "pedometer":
      return Pedometer.isAvailableAsync();
    case "lightSensor":
      return LightSensor.isAvailableAsync();
    default:
      return false;
  }
}

export function startSensorSub(
  key: SensorKey,
  cfg: Record<string, number>,
  onData: (s: string) => void
): Subscription | null {
  const interval = cfg.interval ?? 500;
  switch (key) {
    case "accelerometer":
      Accelerometer.setUpdateInterval(interval);
      return Accelerometer.addListener((d) => onData(xyzFormat(d)));
    case "gyroscope":
      Gyroscope.setUpdateInterval(interval);
      return Gyroscope.addListener((d) => onData(xyzFormat(d)));
    case "magnetometer":
      Magnetometer.setUpdateInterval(interval);
      return Magnetometer.addListener((d) => onData(xyzFormat(d)));
    case "magnetometerUncalibrated":
      MagnetometerUncalibrated.setUpdateInterval(interval);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MagnetometerUncalibrated listener data
      return MagnetometerUncalibrated.addListener((d: any) =>
        onData(
          `x:${d.x.toFixed(3)} y:${d.y.toFixed(3)} z:${d.z.toFixed(3)} | bias x:${d.biasX?.toFixed(3) ?? "—"} y:${d.biasY?.toFixed(3) ?? "—"} z:${d.biasZ?.toFixed(3) ?? "—"}`
        )
      );
    case "barometer":
      Barometer.setUpdateInterval(interval);
      return Barometer.addListener((d) =>
        onData(
          `pressure: ${d.pressure?.toFixed(2) ?? "—"} hPa${d.relativeAltitude != null ? ` | alt: ${d.relativeAltitude.toFixed(1)} m` : ""}`
        )
      );
    case "deviceMotion":
      DeviceMotion.setUpdateInterval(interval);
      return DeviceMotion.addListener((d) => {
        const a = d.acceleration;
        onData(
          a
            ? `accel  x:${(a.x ?? 0).toFixed(3)} y:${(a.y ?? 0).toFixed(3)} z:${(a.z ?? 0).toFixed(3)}`
            : "acceleration: (nessun dato)"
        );
      });
    case "pedometer":
      return Pedometer.watchStepCount((d) => onData(`passi: ${d.steps}`));
    case "lightSensor":
      LightSensor.setUpdateInterval(interval);
      return LightSensor.addListener((d) =>
        onData(`illuminance: ${d.illuminance.toFixed(1)} lux`)
      );
    default:
      return null;
  }
}
