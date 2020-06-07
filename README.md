launchwolf
==========


[![Version](https://img.shields.io/npm/v/launchwolf.svg)](https://npmjs.org/package/launchwolf-cli)
[![Downloads/week](https://img.shields.io/npm/dw/launchwolf.svg)](https://npmjs.org/package/launchwolf-cli)
[![License](https://img.shields.io/npm/l/launchwolf.svg)](https://github.com/avf/launchwolf-cli/blob/master/package.json)

# LaunchWolf

LaunchWolf is a command line tool that allows you to create and deploy MVP websites with a single command. Running `launchwolf launch example.com` will:

- Purchase the domain at gandi.net (more registrars will be supported in the future)
- Set up a mailbox for your new domain
- Set up email forwarding to an address of your choice (optional)
- Set up continuous deployment to Netlify
- Set up your DNS records + SSL for the new domain so that they point to Netlify
- Set up an email newsletter subscription box via mailjet.com (optional)

Everything is already integrated and ready to go.

Other than the domain purchase, all services are free to get started!

## Usage

- Create a static website. For example, you could use your favorite static site generator.
- Run `launchwolf launch example.com`
- Follow the steps in the interactive prompt!
