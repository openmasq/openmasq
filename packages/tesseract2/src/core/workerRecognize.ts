import setImage from './setImage';
import dump from './dump';
import { PSM, DEFAULT_OUTPUT, TESSJS_RECOGNIZE_OPTIONS } from './constants';
import { assertInitialized, log, type Res, type WorkerState } from './workerHandlers';
import type { RecognizePayload, DetectPayload } from './types';

const processOutput = (output: Record<string, boolean>): { workingOutput: Record<string, boolean>; skipRecognition: boolean } => {
  const workingOutput: Record<string, boolean> = { ...DEFAULT_OUTPUT, ...output };
  const nonRecOutputs = ['imageColor', 'imageGrey', 'imageBinary', 'layoutBlocks', 'debug'];
  const recOutputCount = Object.keys(workingOutput)
    .filter((prop) => workingOutput[prop] && !nonRecOutputs.includes(prop))
    .length;
  return { workingOutput, skipRecognition: recOutputCount === 0 };
};

export const recognize = async (state: WorkerState, payload: RecognizePayload, res: Res): Promise<void> => {
  const { mod, api: tessApi } = assertInitialized(state);
  const { image, options = {}, output = {} } = payload;
  state.currentProgress = res;
  try {
    // null-proto (audit L1): mirror `assertRecognizeOptions` so an own `__proto__` key
    // can't slip through here as a no-op assignment either.
    const optionsTess: Record<string, string> = Object.create(null);
    for (const key of Object.keys(options)) {
      if (!key.startsWith('tessjs_') && !(TESSJS_RECOGNIZE_OPTIONS as readonly string[]).includes(key)) {
        optionsTess[key] = String(options[key]);
      }
    }
    if (output.debug) {
      optionsTess.debug_file = '/debugInternal.txt';
      mod.FS.writeFile('/debugInternal.txt', '');
    }

    const paramsChanged = Object.keys(optionsTess).length > 0;
    if (paramsChanged) {
      tessApi.SaveParameters();
      for (const [key, value] of Object.entries(optionsTess)) {
        tessApi.SetVariable(key, value);
      }
    }

    try {
      const { workingOutput, skipRecognition } = processOutput(output as Record<string, boolean>);

      // With rotateAuto, the skew angle is measured on a first pass (which
      // needs an auto page-seg mode) and the image re-set with the rotation.
      let rotateRadiansFinal: number;
      if (options.rotateAuto) {
        const psmInit = tessApi.GetPageSegMode();
        let psmEdited = false;
        if (!([PSM.AUTO_OSD, PSM.AUTO_ONLY, PSM.AUTO] as string[]).includes(String(psmInit))) {
          psmEdited = true;
          tessApi.SetVariable('tessedit_pageseg_mode', String(PSM.AUTO));
        }

        setImage(mod, tessApi, image);
        tessApi.FindLines();
        const angle = tessApi.GetGradient ? tessApi.GetGradient() : tessApi.GetAngle?.() ?? 0;

        if (psmEdited) {
          tessApi.SetVariable('tessedit_pageseg_mode', String(psmInit));
        }

        // Angles below ~0.3° are ignored to save a second pass.
        if (Math.abs(angle) >= 0.005) {
          rotateRadiansFinal = angle;
          setImage(mod, tessApi, image, rotateRadiansFinal);
        } else {
          if (psmEdited) setImage(mod, tessApi, image);
          rotateRadiansFinal = 0;
        }
      } else {
        rotateRadiansFinal = options.rotateRadians ?? 0;
        setImage(mod, tessApi, image, rotateRadiansFinal);
      }

      const rect = options.rectangle;
      if (rect) {
        tessApi.SetRectangle(rect.left, rect.top, rect.width, rect.height);
      }

      if (!skipRecognition) {
        tessApi.Recognize(null);
      } else {
        if (workingOutput.layoutBlocks) tessApi.AnalyseLayout();
        log(state, 'Skipping recognition: no requested output requires it.');
      }

      const result = dump(mod, tessApi, workingOutput, {
        pdfTitle: options.pdfTitle,
        pdfTextOnly: options.pdfTextOnly,
        skipRecognition,
      });
      result.rotateRadians = rotateRadiansFinal;

      if (output.debug) mod.FS.unlink('/debugInternal.txt');
      res.resolve(result);
    } finally {
      if (paramsChanged) tessApi.RestoreParameters();
    }
  } finally {
    state.currentProgress = null;
  }
};

export const detect = async (state: WorkerState, payload: DetectPayload, res: Res): Promise<void> => {
  const { mod, api: tessApi } = assertInitialized(state);
  setImage(mod, tessApi, payload.image);
  const results = new mod.OSResults();
  try {
    if (!tessApi.DetectOS(results)) {
      res.resolve({
        tesseract_script_id: null,
        script: null,
        script_confidence: null,
        orientation_degrees: null,
        orientation_confidence: null,
      });
      return;
    }
    const best = results.best_result;
    const oid = best.orientation_id;
    const sid = best.script_id;
    res.resolve({
      tesseract_script_id: sid,
      script: results.unicharset.get_script_from_script_id(sid),
      script_confidence: best.sconfidence,
      orientation_degrees: [0, 270, 180, 90][oid],
      orientation_confidence: best.oconfidence,
    });
  } finally {
    results.delete?.();
  }
};
