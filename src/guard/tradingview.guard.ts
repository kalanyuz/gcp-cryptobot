import { Injectable, ExecutionContext, CanActivate } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class TradingViewGuard implements CanActivate {
  constructor() {}

  checkAllowedAddress(ipAddress: string): boolean {
    const allowedAddress = [
      '52.89.214.238',
      '34.212.75.30',
      '54.218.53.128',
      '52.32.178.7',
    ];
    if (allowedAddress.find((val) => val === ipAddress) === undefined) {
      console.error(`Received a request from suspicious address: ${ipAddress}`);
      return false;
    }
    return true;
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const ctx = context.switchToHttp().getRequest<Request>();
    const forwardedIp: string = ctx.headers['x-forwarded-for'];
    console.log(forwardedIp);
    return this.checkAllowedAddress(forwardedIp);
  }
}
