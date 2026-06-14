// Belt-and-suspenders with next.config.js: pin the server process to Yerevan
// time at startup. Node applies a change to process.env.TZ to all subsequent
// Date operations.
export async function register() {
  process.env.TZ = 'Asia/Yerevan';
}
