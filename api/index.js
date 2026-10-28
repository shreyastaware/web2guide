// Vercel entrypoint: every /api/* request is rewritten here and handled by the same server code as local runs.
export {serve as default} from '../server/index.js';
