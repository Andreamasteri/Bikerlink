import { useState, useRef } from "react";
import { MountAxisCalibration } from "@/components/MountCalibWizard";

export function useSensorTracking() {
  const [currentG, setCurrentG] = useState(0);
  const [currentLateralG, setCurrentLateralG] = useState(0);
  const [currentTiltDeg, setCurrentTiltDeg] = useState(0);
  const [maxAccelG, setMaxAccelG] = useState(0);
  const [maxDecelG, setMaxDecelG] = useState(0);
  const [maxLateralG, setMaxLateralG] = useState(0);
  const [maxTiltDeg, setMaxTiltDeg] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [showSensorOverlay, setShowSensorOverlay] = useState(false);
  const [mountAxisCalib, setMountAxisCalib] = useState<MountAxisCalibration | null>(null);

  const accelBaselineRef = useRef<number | null>(null);
  const accelCalibSamples = useRef<number[]>([]);
  const maxAccelGRef = useRef(0);
  const maxDecelGRef = useRef(0);
  const maxTiltDegRef = useRef(0);
  const currentAccelGRef = useRef(0);
  const currentLateralGRef = useRef(0);
  const currentTiltDegRef = useRef(0);
  // Gravity-compensated forward linear acceleration (m/s²), used to integrate
  // dead-reckoning speed during GPS blackouts. Kept separate from currentAccelGRef
  // (which still includes gravity for the lean/G overlay).
  const linearAccelFwdRef = useRef(0);
  // Low-pass gravity estimate per axis (m/s²) for the complementary filter that
  // removes gravity from accelerationIncludingGravity on every device.
  const gravityEstRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const maxLateralGRef = useRef(0);
  const sensorStartingRef = useRef(false);
  const sensorSourceRef = useRef<"deviceMotion" | "accelerometer" | "none">("none");
  const mountAxisCalibRef = useRef<MountAxisCalibration | null>(null);
  const bgSensorSnapshotLastWriteRef = useRef(0);

  return {
    currentG,
    setCurrentG,
    currentLateralG,
    setCurrentLateralG,
    currentTiltDeg,
    setCurrentTiltDeg,
    maxAccelG,
    setMaxAccelG,
    maxDecelG,
    setMaxDecelG,
    maxLateralG,
    setMaxLateralG,
    maxTiltDeg,
    setMaxTiltDeg,
    isCalibrating,
    setIsCalibrating,
    showSensorOverlay,
    setShowSensorOverlay,
    mountAxisCalib,
    setMountAxisCalib,
    accelBaselineRef,
    accelCalibSamples,
    maxAccelGRef,
    maxDecelGRef,
    maxTiltDegRef,
    currentAccelGRef,
    currentLateralGRef,
    currentTiltDegRef,
    linearAccelFwdRef,
    gravityEstRef,
    maxLateralGRef,
    sensorStartingRef,
    sensorSourceRef,
    mountAxisCalibRef,
    bgSensorSnapshotLastWriteRef,
  };
}
