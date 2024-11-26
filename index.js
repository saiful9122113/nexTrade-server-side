// npm run starts
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const SSLCommerzPayment = require('sslcommerz-lts')
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const store_id = process.env.STORE_ID
const store_passwd = process.env.STORE_PASSWORD
const is_live = false //true for live, false for sandbox

const port = process.env.PORT || 5000;

const app = express();

//middleWares
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lbe4zil.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
    // console.log('token inside VerifyJWT',req.headers.authorization);
    const authHeader = req.headers.authorization;

    if(!authHeader){
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
        if(err){
            return res.status(403).send({message: 'forbidden access'})
        }
        req.decoded = decoded;
        next();
    })
}

async function run(){
    try{
        const productCollection = client.db('resaleProduct').collection('product');
        const userRoleCollection = client.db('resaleProduct').collection('userRole');
        const orderCollection = client.db('resaleProduct').collection('order');

        app.get('/jwt', async(req, res)=>{
            const email = req.query.email;
            const query = {email: email};
            const user = await userRoleCollection.findOne(query);
            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '14d'})
                return res.send({accessToken: token});
            }
            res.status(403).send({accessToken: ''})
        })

        // Api for adding Product 
        app.post('/add-product', async(req, res)=>{
            const product = req.body;
            // console.log(product);
            const result = await productCollection.insertOne(product);
            res.send(result);
        });

        // Api for post user & seller information 
        app.post('/user-role', async(req, res)=>{
            const role = req.body;
            const isEmailExist = await userRoleCollection.findOne({email: role.email})
            if(!isEmailExist) {
                await userRoleCollection.insertOne(role);
                const userInfo = await userRoleCollection.findOne({email: role.email})
                return res.send(userInfo);
            }

            return res.send(isEmailExist);
        });

        app.get("/get-user-info/:email", async(req, res) => {
            const email = req.params.email;

            const userInfo = await userRoleCollection.findOne({email});

            return res.send(userInfo);
        })

        // Api for sellers own product 
        app.get('/products/:email', async (req, res) => {
            const query = { email: req.params.email };
            const result = await productCollection.find(query).toArray();
            res.send(result);
        });

        // api for single poduct
        app.get("/single-product/:id", async(req, res) => {
            const id = req.params.id;
            const result = await productCollection.findOne({_id: new ObjectId(id)})
            
            return res.send(result);
        })

        // api for search poduct
        app.get("/search-product/:name", async(req, res) => {
            const name = req.params.name;
            const result = await productCollection.find({
                productName: { $regex: name, $options: "i" }
            }).toArray();
            
            return res.send(result);
        })
        
        // Api for categorywise data 
        app.get('/product/:category', async (req, res) => {
            const query = { category: req.params.category };
            const result = await productCollection.find(query).toArray();
            res.send(result);
        });

        // Api for adding order 
        app.post('/add-order', async(req, res)=>{
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result);
        });

        // Api for all seller 
        app.get('/category/:role', async (req, res) => {
            const query = { role: req.params.role };
            // const email = req.query.email;
            // const decodedEmail = req.decoded.email;
            // console.log(email, decodedEmail);
            const result = await userRoleCollection.find(query).toArray();
            res.send(result);
        });

        // Api for orders depends on email 
        app.get('/my-orders/:email', async (req, res) => {
            const query = {email: req.params.email};
            const result = await orderCollection.find(query).toArray();
            res.send(result);
        });

        app.post("/get-payment-link", verifyJWT, async (req, res) => {
            try {
                const {userInfo, product} = req.body;
        
                const data = {
                    total_amount: product.productResalePrice,
                    currency: 'BDT',
                    tran_id: uuidv4(), // use unique tran_id for each api call
                    success_url: 'http://localhost:3000/success',
                    fail_url: 'http://localhost:3000/fail',
                    cancel_url: 'http://localhost:3000/cancel',
                    ipn_url: 'http://localhost:3000/ipn',
                    shipping_method: 'Courier',
                    product_name: product.productName,
                    product_category: product.category,
                    product_profile: product.condition,
                    cus_name: userInfo.firstName,
                    cus_email: userInfo.email,
                    cus_add1: userInfo.address,
                    cus_add2: userInfo.address,
                    cus_city: userInfo.city,
                    cus_state: userInfo.state,
                    cus_postcode: userInfo.postal,
                    cus_country: userInfo.country,
                    cus_phone: userInfo.phone,
                    cus_fax: userInfo.phone,
                    ship_name: userInfo.firstName,
                    ship_add1: userInfo.address,
                    ship_add2: userInfo.address,
                    ship_city: userInfo.city,
                    ship_state: userInfo.state,
                    ship_postcode: userInfo.postal,
                    ship_country: userInfo.country,
                };
                const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
                sslcz.init(data).then(apiResponse => {
                    // Redirect the user to payment gateway
                    // console.log("apiResponse: ", apiResponse)
                    let GatewayPageURL = apiResponse.GatewayPageURL
                    // console.log('Redirecting to: ', GatewayPageURL)
                    return res.status(200).json({ url: GatewayPageURL })
                });
        
            } catch (error) {
                console.log(error)
                return res.status(500).json({ message: "Error in payment!" })
            }
        })
        
    }
    finally{

    }
}
run().catch(err=>console.log(err))


app.get('/', async(req, res) =>{
    res.send('product resale server is running')
});

app.listen(port, ()=> {
    console.log(`product resale server running on this ${port}`)
});