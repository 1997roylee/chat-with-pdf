import { requestApi } from '@/lib/gpt';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages = body.messages ?? [];
  const question = messages[messages.length - 1].content;

  //   const q = 'HashKey Exchange目前的客户托管资产总量是多少?';
  //   const result = await requestApi(question);
  return NextResponse.json({
    ...(await requestApi(question))
  });
}
