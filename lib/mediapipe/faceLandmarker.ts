import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

let faceLandmarker: FaceLandmarker | null = null;

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
    if (faceLandmarker) {
     return faceLandmarker;
    }

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
       baseOptions: {
         modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
         delegate: "CPU",
       },

       runningMode: "VIDEO",
       numFaces: 1,

       outputFaceBlendshapes: false,
       outputFacialTransformationMatrixes: true,
    });

    return faceLandmarker;
}