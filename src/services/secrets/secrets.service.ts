import { Injectable } from '@nestjs/common';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

@Injectable()
export class SecretsService {
  private readonly client;
  constructor() {
    this.client = new SecretManagerServiceClient();
  }

  async getSecret(secret: string, version: string = 'latest'): Promise<string> {
    const projectID = await this.client.getProjectId();
    const [accessResponse] = await this.client.accessSecretVersion({
      name: `projects/${projectID}/secrets/${secret}/versions/${version}`,
    });
    // @ts-ignore
    return accessResponse.payload.data.toString('utf8');
  }
}
