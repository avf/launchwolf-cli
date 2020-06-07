launchwolf
==========


[![Version](https://img.shields.io/npm/v/launchwolf-cli.svg)](https://npmjs.org/package/launchwolf-cli)
[![Downloads/week](https://img.shields.io/npm/dw/launchwolf-cli.svg)](https://npmjs.org/package/launchwolf-cli)
[![License](https://img.shields.io/npm/l/launchwolf-cli.svg)](https://github.com/avf/launchwolf-cli/blob/master/package.json)

# LaunchWolf

LaunchWolf is a command line tool that allows you to create and deploy MVP websites with a single command. Usage:

```npx launchwolf-cli launch example.com```

This will automatically:

- Purchase the domain `example.com` at gandi.net
- Set up static hosting with Netlify and deploy
- Set up your DNS records + SSL for the new domain so that they point to Netlify
- Set up a mailbox `yourName@example.com` for your new domain
- Set up email forwarding to an address of your choice (optional)
- Set up an email newsletter subscription box via mailjet.com (optional)

Everything will be integrated and ready to go.

Other than the domain purchase, all services are free to get started!

## Usage

- Create a static website. For example, you could use your favorite static site generator.
- Run `npx launchwolf-cli launch example.com` from your project directory
- Follow the steps in the interactive prompt!

## Advanced Configuration

- Upon first run, the tool will gather all required information from you and store it in a global config file. 
- Re-run the tool to see the path to the global config file.
- You can also create a local config file in the folder from which you run launchwolf. Local config values always have priority over global ones.

## Troubleshooting

- You need to have the latest version of `npm` installed to use the `npx` command.
- You can also install LaunchWolf globally by running `npm install -g launchwolf-cli`. Then you can run it with `launchwolf launch example.com`. This way you don't have to re-download the package each time you want to use the command.

## Contributing

Questions, Feedback, Requests? Feel free to open an issue here on GitHub!
