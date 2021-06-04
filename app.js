require('dotenv').config()
const express=require("express")
const mongoose=require("mongoose")
const ejs=require("ejs")
const bodyparser=require("body-parser")
const passport=require("passport")
const session=require("express-session")
const passportlocalmongoose=require("passport-local-mongoose")
const multer=require("multer")
const Razorpay=require("razorpay")
const crypto=require("crypto")
const fs=require("fs")
const lodash=require("lodash")
const xenosearch=require("./xenosearch.js")
const sleep = require('system-sleep');
const AWS = require('aws-sdk');
var ObjectId = require('mongodb').ObjectID;
var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.gmailid,
    pass: process.env.gmailid_password
  }
});

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const params = {
    Bucket: "xenokart",
    CreateBucketConfiguration: {
        // Set your region here
        LocationConstraint: "eu-west-1"
    }
};

s3.createBucket(params, function(err, data) {
    if (err) console.log(err, err.stack);
    else console.log('Bucket Created Successfully', data.Location);
});

const { runInNewContext } = require('vm')
const { result } = require('lodash')

const app=express();
mongoose.set('useCreateIndex', true);

app.use(session({
    secret:process.env.passport_secret,
    resave: false,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb+srv://"+process.env.mongoDB_username+":"+process.env.mongoDB_password+"@cluster0.kwitg.mongodb.net/xenokart",{
    useNewUrlParser:true,
    useUnifiedTopology:true,
    useCreateIndex: true,
    useFindAndModify: false
}).then(()=>{
    console.log("Connected to MongoDB Server");
});

var instance = new Razorpay({
    key_id: process.env.razorpay_id,
    key_secret: process.env.razorpay_secret
})

const userschema=new mongoose.Schema({
    name: {
        type:String,
        required:true
    },
    username: {
        type:String,
        required:true,
        unique:true
    },
    password: {
        type:String
    },
    orders: [],
    address:String,
    mobile: Number
});
userschema.plugin(passportlocalmongoose);

const User=mongoose.model("User",userschema);

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

const upload = multer({ 
    dest: 'public/images',
    limits: {
        fileSize:10000000
    },
    fileFilter(req,file,cb){
        if(!(file.originalname.endsWith('.jpg') || file.originalname.endsWith('.jpeg') || file.originalname.endsWith('.png'))){
            // res.redirect("/add-product");
            return cb(new Error('please upload an image'))
        }
        cb(undefined,true)
    }
});

app.set("view engine", "ejs");
app.use(bodyparser.urlencoded({extended:true}));
app.use(express.static("public"));

const productschema=mongoose.Schema({
    name:String,
    price:Number,
    imageURL:String,
    description:String,
    number_of_clicks: {
        type:Number,
        default:0
    },
    number_of_impressions:{
        type:Number,
        default:1
    },
    clickthrough: {
        type:Number,
        default:0
    },
    pricing_way:Number
});

const Product=mongoose.model("Product",productschema);

const orderschema=mongoose.Schema({
    customer_id:String,
    order:[],
    count:Number
});
const Order=mongoose.model("Order",orderschema);

const tokenschema=mongoose.Schema({
    tokenid:String,
    name:String,
    username:String,
    password:String,
    address:String,
    mobile: Number
});
const Token=mongoose.model('Token',tokenschema);

/////////ADMIN//////////////////////////////////////////////////////////////

app.get("/add-product",(req,res)=>{
    if(req.isAuthenticated() && req.user.username=="admin@xenokart.com"){
    res.render("add-product",{title: "Add Product"});
    }
    else{
        res.redirect("/login");
    }
})

app.get("/admin-product-view",(req,res)=>{
    if(req.isAuthenticated() && req.user.username=="admin@xenokart.com"){
        Product.find({},(err,products)=>{
            if(err){
                console.log(err);
            }else{
                res.render("admin_product_view",{product: products, title: "Admin Product View"});
            }
        })
    }
    else{
        res.redirect("/products");
    }
})

app.get("/login",(req,res)=>{
    if(typeof req.session.cart==='undefined'){
        req.session.cart=[];
    }
    if(req.isAuthenticated()){
        res.redirect("/products");
    }
    else{
        res.render("login",{title: "Login",isloggedin:false,cart_size:req.session.cart.length});
    }
})

app.get("/register",(req,res)=>{
    if(typeof req.session.cart==='undefined'){
        req.session.cart=[];
    }
    if(req.isAuthenticated()){
        res.redirect("/products");
    }
    else{
        res.render("register",{title: "Register",isloggedin:false,cart_size:req.session.cart.length});
    }
})

app.get("/admin-orders",(req,res)=>{
    Order.find({},(err,body)=>{
        if(err){
            console.log(err);
        }else{
            res.render("admin_orders",{title: "Orders",order:body})
        }
    })
})

app.post("/product-delete",(req,res)=>{
    if(req.isAuthenticated() && req.user.username=="admin@xenokart.com"){
        Product.findByIdAndRemove(req.body.id,(err,oldcontent)=>{
            if(err){
                console.log(err);
            }
            else{
                fs.unlinkSync("public/images/"+oldcontent.imageURL,(err)=>{
                    if(err){
                        console.log(err);
                    }
                });
                res.redirect("/admin-product-view");
            }
        })
    }
    else{
        res.redirect("/login");
    }
})

app.post("/order-complete",(req,res)=>{
    if(req.isAuthenticated() && req.user.username=="admin@xenokart.com"){
        User.findById(req.body.id,(err,kmn)=>{
            if(err){
                console.log(err);
            }else{
                kmn.orders[req.body.count-1].status="Delivered";
                User.findByIdAndUpdate(req.body.id,{orders:kmn.orders},(err)=>{
                    if(err){
                        console.log(err);
                    }
                })
            }
        });
        Order.findByIdAndDelete(req.body.orderid,(err)=>{
            if(err){
                console.log(err);
            }
        });
        res.redirect("/admin-orders");
    }
    else{
        res.redirect("/login");
    }
})

app.post("/product-edit",(req,res)=>{
    if(req.isAuthenticated() && req.user.username=="admin@xenokart.com"){
        Product.findById(req.body.id,(err,body)=>{
            if(err){
                console.log(err);
            }
            else{
                res.render("update-product",{title:"Edit Product",id:req.body.id,product:body});
            }
        })
    }
    else{
        res.redirect("/login");
    }
})

app.post("/product-update",upload.single('product_image'),(req,res)=>{
    if(req.isAuthenticated() && req.user.username=="admin@xenokart.com"){
        if(req.file){
            Product.findByIdAndUpdate(req.body.product_id,{
                "name":req.body.product_name,
                "price": req.body.product_price,
                "imageURL":req.file.filename,
                "description":req.body.product_description},
                (err,oldcontent)=>{
                    fs.unlinkSync("public/images/"+oldcontent.imageURL,(err)=>{
                        if(err){
                            console.log(err);
                        }
                    });
                    if(err){
                        console.log(err);
                    }
                    else{
                        res.redirect("/admin-product-view");
                    }
                }
            );
        }else{
            Product.findByIdAndUpdate(req.body.product_id,{
                "name":req.body.product_name,
                "price": req.body.product_price,
                "description":req.body.product_description},
                (err)=>{
                    if(err){
                        console.log(err);
                    }
                    else{
                        res.redirect("/admin-product-view");
                    }
                }
            );
        }
    }
    else{
        res.redirect("/login");
    }
})

app.post("/add-product",upload.single('product_image'),(req,res)=>{
    if(req.isAuthenticated() && req.user.username=="admin@xenokart.com"){
        const product_data=new Product({
            "name":req.body.product_name,
            "price": req.body.product_price,
            "imageURL":req.file.filename,
            "description":req.body.product_description,
            "pricing_way":req.body.product_pricing_way
        })
        product_data.save();
        res.redirect("/admin-product-view");
    }
    else{
        res.redirect("/login");
    }
})

app.post("/register",(req,res) =>{
    if(req.body.username=="admin@xenokart.com"){
        User.register({username:req.body.username,name:req.body.name,address:req.body.address,mobile:req.body.mobile},req.body.password,(err,users)=>{
            if(err){
                console.log(err);
                res.redirect("/register");
            }
            else{
                var authenticate=User.authenticate();
                authenticate(req.body.username, req.body.password, function(err, result) {
                    if (err) { 
                        console.log(err);
                    }
                    else{
                        res.redirect("/login");
                    }
                });
            }
        });
    }
    else{
        crypto.randomBytes(32,(err,buffer)=>{
            if(err){
                console.log(err);
                res.redirect("/register");
            }
            else{
                let tokenid=buffer.toString('hex');
                let text='<h1>Click the following link to confirm your EmailID: <a href="http://localhost:3000/register/'+tokenid+'">Register</a></h1>';
                var mailOptions = {
                    from: 'arpitmishra2407@gmail.com',
                    to: req.body.username,
                    subject: 'Confirmation Mail from XenoKART',
                    html: text
                };
                
                transporter.sendMail(mailOptions, (error, info)=>{
                    if (error) {
                        console.log(error);
                    } else {
                        const confirmation_mail=new Token({
                            tokenid:tokenid,
                            username:req.body.username,
                            name:req.body.name,
                            address:req.body.address,
                            mobile:req.body.mobile,
                            password:req.body.password
                        })
                        confirmation_mail.save();
                        res.render("confirmation_mail",{title: "Confirm Your Mail",isloggedin:false,cart_size:req.session.cart.length});
                    }
                });
            }
        });
    }
});

app.get("/register/:tokenid",(req,res)=>{
    Token.findOne({tokenid:req.params.tokenid},(err,body)=>{
        if(err){
            console.log(err);
        }
        else{
            User.register({username:body.username,name:body.name,address:body.address,mobile:body.mobile},body.password,(err,users)=>{
                if(err){
                    console.log(err);
                    res.redirect("/register");
                }
                else{
                    var authenticate=User.authenticate();
                    authenticate(body.username, body.password, function(err, result) {
                        if (err) { 
                            console.log(err);
                        }
                        else{
                            res.redirect("/login");
                        }
                    });
                }
            });
            Token.findByIdAndDelete(body._id,(err)=>{
                if(err){
                    console.log(err);
                }
            });
        }
    });
});

app.post('/login', passport.authenticate('local', { successRedirect: '/admin-product-view',
                                   failureRedirect: '/login'})
);

app.get("/logout",(req,res)=>{
    req.logout();
    res.redirect("/login");
});

////////////////////////////////////////ADMIN////////////////////////////

app.get("/",(req,res)=>{
    res.redirect("/products");
})

app.get("/products",(req,res)=>{
    if(typeof req.session.cart==='undefined'){
        req.session.cart=[];
    }
    if(req.isAuthenticated()){
        Product.find({},(err,products)=>{
            if(err){
                console.log(err);
            }else{
                products.forEach((product)=>{
                    Product.findByIdAndUpdate(product._id,{number_of_impressions:product.number_of_impressions+1},(err)=>{
                        if(err){
                            console.log(err);
                        }
                    });
                });
                res.render("products_display",{product: products, heading:"Top Recommendations for You", title: "Top Recommendations for You",isloggedin:true,cart_size:req.session.cart.length});
            }
        }).sort({clickthrough:-1}).limit(8);
    }else{
        Product.find({},(err,products)=>{
            if(err){
                console.log(err);
            }else{
                products.forEach((product)=>{
                    Product.findByIdAndUpdate(product._id,{number_of_impressions:product.number_of_impressions+1},(err)=>{
                        if(err){
                            console.log(err);
                        }
                    });
                });
                res.render("products_display",{product: products, heading:"Top Recommendations for You", title: "Top Recommendations for You",isloggedin:false,cart_size:req.session.cart.length});
            }
        }).sort({clickthrough:-1}).limit(8);
    }
})

app.get("/specific-product/",(req,res)=>{
    if(typeof req.session.cart==='undefined'){
        req.session.cart=[];
    }
    
    let id = req.query.id;
    Product.findById(id,(err,product)=>{
        if(err){
            console.log(err);
        }
        else{
            Product.findByIdAndUpdate(id,{number_of_clicks:product.number_of_clicks+1,clickthrough:(product.number_of_clicks+1)*100/(product.number_of_impressions)},(err)=>{
                if(err){
                    console.log(err);
                }
            });
            if(req.isAuthenticated()){
                res.render("specific_product",{product: product, title: product.name, isloggedin:true, cart_size:req.session.cart.length});
            }
            else{
                res.render("specific_product",{product: product, title: product.name, isloggedin:false, cart_size:req.session.cart.length});
            }
        }
    });
});

app.get("/cart",(req,res)=>{
    if(typeof req.session.cart==='undefined'){
        req.session.cart=[];
    }
    if(req.isAuthenticated()){
        res.render("cart",{title:"Cart", isloggedin:true, product:req.session.cart, cart_size:req.session.cart.length});
    }
    else{
        res.render("cart",{title:"Cart", isloggedin:false, product:req.session.cart, cart_size:req.session.cart.length});
    }
})

app.get("/orders",(req,res)=>{
    if(req.isAuthenticated()){
        User.findById(req.user._id,(err,body)=>{
            if(err){
                console.log(err);
            }else{
                res.render("orders",{title:"Order", isloggedin:true, order:body.orders, cart_size:req.session.cart.length})
            }
        })
    }
    else{
        res.redirect("/login");
    }
})

app.post("/search-query",(req,res)=>{
    Product.find({},{name:1},(err,products)=>{
        if(err){
            console.log(err);
        }
        else{
            product_array=[]
            item_array=[]
            products.forEach((item)=>{
                item_array.push(item._id);
                item_array.push(lodash.lowerCase(item.name));
                product_array.push(item_array);
                item_array=[];
            })
            let result=xenosearch(product_array,lodash.lowerCase(req.body.query));
            var final_array=[];
            for(i=0;i<result.length;i++){
                if(result[i][2]<1){
                    break;
                }
                else{
                    Product.findById(result[i][0],(err,body)=>{
                        if(err){
                            console.log(err);
                        }
                    }).then((body)=>{
                        final_array.push(body);
                    });
                }
            };
            sleep(20);
            final_array.forEach((product)=>{
                Product.findByIdAndUpdate(product._id,{number_of_impressions:product.number_of_impressions+1},(err)=>{
                    if(err){
                        console.log(err);
                    }
                });
            });
            if(req.isAuthenticated()){
                res.render("products_display",{product: final_array, heading:"Search Result for "+req.body.query, title: "Search Result for "+req.body.query,isloggedin:true,cart_size:req.session.cart.length});
            }
            else{
                res.render("products_display",{product: final_array, heading:"Search Result for "+req.body.query, title: "Search Result for "+req.body.query,isloggedin:false,cart_size:req.session.cart.length});
            }
        }
    })
})

app.post("/add-to-cart",(req,res)=>{
    flag=0;
    Product.findById(req.body._id,(err,product)=>{
        if(err){
            console.log(err);
        }
        else{
            Product.findByIdAndUpdate(req.body._id,{number_of_clicks:product.number_of_clicks+1,clickthrough:(product.number_of_clicks+1)*100/(product.number_of_impressions)},(err)=>{
                if(err){
                    console.log(err);
                }
            })
        }
    });
    for(i=0;i<req.session.cart.length;i++){
        if(req.session.cart[i].name==req.body.name){
            req.session.cart[i].quantity=Number(req.session.cart[i].quantity)+Number(req.body.quantity);
            flag=1;
            break;
        }
    }
    if(!flag){
    req.session.cart.push(req.body);
    }
    res.redirect("/products");
})

app.post("/delete-cart-item",(req,res) =>{
    for(i=0;i<req.session.cart.length;i++){
        if(req.session.cart[i].name==req.body.name){
            req.session.cart.splice(i,1);
            break;
        }
    }
    res.redirect("/cart");
})

app.post("/checkout",(req,res)=>{
    if(req.isAuthenticated()){
        res.render("checkout",{price:req.body.total_price,isloggedin:true,title:"Checkout",cart_size:req.session.cart.length})
    }
    else{
        res.redirect("/login");
    }
})

app.post("/place_order",(req, res)=>{
    if(req.isAuthenticated()){
        if(req.body.payment_method==2){
            User.findById(req.user._id,(err,body)=>{
                if(err){
                    console.log(err);
                }
                else{
                    let order=body.orders;
                    const ordernumber=new Order({
                        customer_id:req.user._id,
                        order:req.session.cart,
                        count:order.length+1
                    })
                    ordernumber.save();
                    order.push({count:order.length+1,cart:req.session.cart,status:"On The Way"});
                    req.session.cart=[];
                    User.findByIdAndUpdate(req.user._id,{orders:order},(err)=>{
                        if(err){
                            console.log(err);
                        }
                        else{
                            res.redirect("/products");
                        }
                    });
                }
            })
        }
        else{
            let amount=0;
            req.session.cart.forEach(function(ij){
                amount=amount+Number(ij.quantity)*Number(ij.price);
            })
            User.findById(req.user._id,(err,body)=>{
                if(err){
                    console.log(err);
                }
                else{
                    instance.orders.create({"amount": amount*100,"currency": "INR"}).then((data)=>{
                        res.render("online-payment-page",{name:req.user.name,username:req.user.username,mobile:req.user.mobile,amount:data.amount,id:data.id,isloggedin:true,title:"Checkout",cart_size:req.session.cart.length})
                    }).catch((err)=>{
                        console.log(err);
                    })
                }
            });
        }
    }
    else{
        res.redirect("/login");
    }
})

app.get("/success-payment",(req,res)=>{
    console.log(req.body);
    User.findById(req.user._id,(err,body)=>{
        if(err){
            console.log(err);
        }
        else{
            let order=body.orders;
            const ordernumber=new Order({
                customer_id:req.user._id,
                order:req.session.cart,
                count:order.length+1
            })
            ordernumber.save();
            order.push({count:order.length+1,cart:req.session.cart,status:"On The Way"});
            req.session.cart=[];
            User.findByIdAndUpdate(req.user._id,{orders:order},(err)=>{
                if(err){
                    console.log(err);
                }
                else{
                    res.redirect("/products");
                }
            });
        }
    });
})

app.listen(3000,() => {
    console.log("Server Started");
});