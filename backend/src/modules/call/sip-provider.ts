export interface MakeCallResult {
  success: boolean;
  sipCallId?: string;
  error?: string;
}

export interface SipProvider {
  makeCall(params: {
    fromOaid: string;
    toZaloIdOrPhone: string;
    sipCallId: string;
    appId: string;
  }): Promise<MakeCallResult>;
}

export class MockSipProvider implements SipProvider {
  async makeCall(params: {
    fromOaid: string;
    toZaloIdOrPhone: string;
    sipCallId: string;
    appId: string;
  }): Promise<MakeCallResult> {
    console.log(`[MockSipProvider] Initiating outbound SIP call. Call ID: ${params.sipCallId}. From OA: ${params.fromOaid} To: ${params.toZaloIdOrPhone} via ZCC SIP Trunk <${params.appId}>.zcc.openapi.zaloapp.com`);
    return {
      success: true,
      sipCallId: params.sipCallId
    };
  }
}

export class AsteriskProvider implements SipProvider {
  async makeCall(params: {
    fromOaid: string;
    toZaloIdOrPhone: string;
    sipCallId: string;
    appId: string;
  }): Promise<MakeCallResult> {
    console.log(`[AsteriskProvider] Triggering Asterisk AMI Originate command for ZCC call: Call ID: ${params.sipCallId}, To: ${params.toZaloIdOrPhone}`);
    // Real implementation would connect to Asterisk AMI/ARI:
    // Channel: SIP/zcc-trunk/${params.toZaloIdOrPhone}
    // Context: zalo-outbound, Exten: ${params.fromOaid}
    return {
      success: true,
      sipCallId: params.sipCallId
    };
  }
}

export class FreeSwitchProvider implements SipProvider {
  async makeCall(params: {
    fromOaid: string;
    toZaloIdOrPhone: string;
    sipCallId: string;
    appId: string;
  }): Promise<MakeCallResult> {
    console.log(`[FreeSwitchProvider] Triggering FreeSWITCH ESL originate command for ZCC call: Call ID: ${params.sipCallId}, To: ${params.toZaloIdOrPhone}`);
    // Real implementation would connect to FreeSWITCH Event Socket:
    // originate sofia/gateway/zcc-trunk/${params.toZaloIdOrPhone} &echo
    return {
      success: true,
      sipCallId: params.sipCallId
    };
  }
}
