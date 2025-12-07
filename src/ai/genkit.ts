import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * The initialized Genkit instance configured with the Google AI plugin.
 * Uses the 'googleai/gemini-2.5-flash' model.
 */
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash',
});
