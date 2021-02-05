## Description

DIY(deploy it yourself) containerized Serverless crypto trading API designed to be used with indicator webhooks. Designed to be primarily run on Google Cloud Platform (Cloud Run). No centralized database required. You take control of all your API keys. Designed to be easily customizable to support various exchanges.

## System diagram (v0.1)

![system diagram](https://storage.googleapis.com/gcp-cryptobot/v01diagram.png)
Future roadmap sneakpeaks can be checked out [here](https://docs.google.com/presentation/d/1maTXHVqpvblkvHI5o0LS2dbBDzrYqqwhju4vWyNwFb4/edit?usp=sharing)

## Installation

```bash
$ yarn install
```

## Running the app

```bash
# development
$ yarn start

# watch mode
$ yarn start:dev

# production mode
$ yarn start:prod
```

## Test

```bash
# unit tests
$ yarn test

# e2e tests
$ yarn test:e2e

# test coverage
$ yarn test:cov
```

## Support

GCP-cryptobot is an MIT-licensed open source project. [To be updated]

## Stay in touch

- Author - [Kalanyu Zintus-art](https://kalanyuz.com)
- Twitter - [@nestframework](https://twitter.com/kalanyuz)

## License

Nest is [MIT licensed](LICENSE).
