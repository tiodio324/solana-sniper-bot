import {
    Connection,
    PublicKey,
    clusterApiUrl,
    Keypair
} from '@solana/web3.js';

const generateKeyPair = async () => {
    const newPair = new Keypair();

    const publicKey = new PublicKey(newPair._keypair.publicKey).toString();
    const privateKey = newPair._keypair.secretKey;

    const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

    console.log("Public Key: ", publicKey);
    console.log("Private Key: ", privateKey);
    console.log("Connection object is: ", connection);
}

// node -e "const privateKey = new Uint8Array([
//   173,   4, 224, 165,  64,  99, 171, 236,  76,  64, 232,
//   121,  96,   5, 150,  65,  93,  80, 179,  21, 241,  63,
//    81, 136, 240, 247,  25, 210, 217,  49,  28,  49,  46,
//    94,  79,  63,  38, 187, 134,  59, 143,   5, 243, 106,
//   125,  19, 103,  75, 252, 224,  86,  65, 152, 239,  18,
//    68, 216, 197, 245,  91, 126, 237, 114, 117
// ]); console.log(Buffer.from(privateKey).toString('hex'));"

generateKeyPair();
