import {
  Injectable,
  ExecutionContext,
  CallHandler,
  NestInterceptor,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BotConfigService } from '../services/configs/botconfigs.service';
import { Observable } from 'rxjs';
import { BotRequest } from 'src/exchange/entities/exchange';

/**
 * Intercepts requests sent from Guard (if any)
 * Prevents unknown asset pairs to be traded
 */
@Injectable()
export class ExchangeInterceptor implements NestInterceptor {
  tradingPairs: BotRequest[];
  constructor(configs: BotConfigService) {
    this.tradingPairs = configs.tradingPairs;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const asset: string = request.body['asset'];
    const denominator: string = request.body['denominator'];

    try {
      const allowed = this.tradingPairs.some((item) => {
        return item.asset === asset && item.denominator === denominator;
      });

      if (!allowed) {
        throw new HttpException(
          'Assets not in allowed list',
          HttpStatus.NOT_ACCEPTABLE,
        );
      }
      return next.handle();
    } catch (error) {
      throw error;
    }
  }
}
