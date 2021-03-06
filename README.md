![](https://github.com/kalanyuz/gcp-cryptobot/workflows/Build%20&%20Tests/badge.svg)

## Description

DIY(deploy it yourself) containerized Serverless crypto trading API designed to be used with indicator webhooks designed to be primarily run on Google Cloud Platform [(Cloud Run)](https://cloud.google.com/run). No centralized database required. You take control of all your API keys. Easily customizable to support various exchanges.

## How tos

Visit the [wiki](https://github.com/kalanyuz/gcp-cryptobot/wiki) section to see guides on how to buid, deploy, or configure the service (WIP).

## System diagram and example use cases

![system diagram](https://storage.googleapis.com/gcp-cryptobot/v013diagram.png)

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

## Additional resources & tutorials

- [Cloud Run community FAQs](https://github.com/ahmetb/cloud-run-faq)
- [I wrote a serverless app to automate my cryptocurrency purchases on GCP](https://medium.com/coinmonks/i-wrote-a-serverless-app-to-automate-my-cryptocurrency-purchases-17c9a869d0c7)
- [Setup guide: Automate DCA and plan for liquidation wicks with gcp-cryptobot](https://medium.com/coinmonks/setup-guide-automate-dca-and-plan-for-liquidation-wicks-with-gcp-cryptobot-32414ef72251)
- [Setup guide: Automate buy on Tradingview signals with gcp-cryptobot](https://medium.com/coinmonks/setup-guide-automate-buy-on-tradingview-signals-with-gcp-cryptobot-a6941b70924)

## Donations

Donations can be made by sending me BTC at the following address: **bc1q2ja6j0dw7tg8k0rkwfug0lartl6afquj9zad7a**

## Stay in touch

- Twitter - [@kalanyuz](https://twitter.com/kalanyuz)

## License

Nest is [MIT licensed](LICENSE).
