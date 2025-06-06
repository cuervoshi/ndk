import { runOnJS, runOnUI, useWorkletCallback } from 'react-native-reanimated';
import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import type { NDKEvent } from "@nostr-dev-kit/ndk";

/**
 * Worklet function that performs signature verification
 * This runs on a separate thread to avoid blocking the UI
 */
export function verifySignatureWorklet(
  serialized: string,
  id: string,
  sig: string,
  pubkey: string,
  callback: (result: boolean) => void
) {
  'worklet';
  try {
    // Calculate the event hash
    const eventHash = sha256(new TextEncoder().encode(serialized));
    const buffer = Buffer.from(id, "hex");
    const idHash = Uint8Array.from(buffer);

    // Compare the hashes
    let result = true;
    if (eventHash.length !== idHash.length) {
      result = false;
    } else {
      for (let i = 0; i < eventHash.length; i++) {
        if (eventHash[i] !== idHash[i]) {
          result = false;
          break;
        }
      }
    }

    // If hashes match, verify the signature
    if (result) {
      result = schnorr.verify(sig, buffer, pubkey);
    }

    // Send the result back to the JS thread
    runOnJS(callback)(result);
  } catch (_err) {
    // On any error, avoid crashing the UI thread and report invalid signature
    runOnJS(callback)(false);
  }
}

/**
 * Verify a signature asynchronously using the worklet
 * This function matches the interface expected by NDK's signatureVerificationFunction
 *
 * @param event The NDK event to verify
 * @returns Promise that resolves to a boolean indicating if the signature is valid
 */
export async function verifySignatureAsync(event: NDKEvent): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const serialized = event.serialize();
    
    // Run the verification in a worklet
    runOnUI(verifySignatureWorklet)(
      serialized,
      event.id,
      event.sig!,
      event.pubkey!,
      resolve
    );
  });
}

/**
 * Hook to create a signature verification function that can be used in components
 */
export function useSignatureVerification() {
  return useWorkletCallback((event: NDKEvent) => {
    return verifySignatureAsync(event);
  }, []);
}