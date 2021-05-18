![](https://github.com/kalanyuz/gcp-cryptobot/workflows/Build%20&%20Tests/badge.svg)

## Description

DIY(deploy it yourself) containerized Serverless crypto trading API designed to be used with indicator webhooks designed to be primarily run on Google Cloud Platform [(Cloud Run)](https://cloud.google.com/run). No centralized database required. You take control of all your API keys. Easily customizable to support various exchanges.

## How tos

Visit the [wiki](https://github.com/kalanyuz/gcp-cryptobot/wiki) section to see guides on how to buid, deploy, or configure the service (WIP).

## System diagram and example use cases (v0.1)

![system diagram](https://storage.googleapis.com/gcp-cryptobot/v012diagram.png)

## Disclaimer

This project is intended for personal use only. Please carefully review the source code before running it on any service. Unattended usage or exposing your api keys and secrets to 3rd party could result in loss of funds. We are not responsible for any consequences occurred from using/running this source code. **Use it at your own risk**.

## Starting development environment & Installation

```bash
$ docker-compose up -d
$ docker-compose exec app yarn install
```

## Running the app

```bash
# development
$ docker-compose exec app yarn start:dev

# production
$ docker-compose exec app yarn start
```

## Test

```bash
# unit tests
$ docker-compose exec app yarn test
```

## Additional resources

- [Cloud Run community FAQs](https://github.com/ahmetb/cloud-run-faq)

## Stay in touch

- Twitter - [@kalanyuz](https://twitter.com/kalanyuz)

## License

Nest is [MIT licensed](LICENSE).
