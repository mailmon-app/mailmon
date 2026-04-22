{
  description = "mailmon-dev development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_24
            pnpm
            just
            docker-compose
          ];

          shellHook = ''
            echo "💌 Mailmon Dev Environment Loaded"
            echo "Node.js: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo "Run 'just' to see available commands."
          '';
        };
      }
    );
}
