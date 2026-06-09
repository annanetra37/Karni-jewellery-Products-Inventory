import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { saveImage } from '@/lib/upload';

export const runtime = 'nodejs';
// Route handlers stream the body and are not bound by the Server Action
// bodySizeLimit, so large images upload fine here.

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!isAdmin(u)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid upload' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'no file provided' }, { status: 400 });
  }
  try {
    const url = await saveImage(file);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
