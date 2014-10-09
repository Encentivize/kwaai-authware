//stores the tenants and users ina  single document
var hasher = require('password-hash-and-salt');
var kwaaiCrudware=require('kwaai-crudware');
var kwaaiCrud=require("kwaai-crud");
var kwaaiSchema=require("kwaai-schema");
var mongo=require("mongodb");
var deepCopy=require("deepcopy");

var _globalOptions={};

var multiTenantTools={
    //********************************************************************************************************************************************
    //CREATE
    //*******************************************************************************************************************************************
    createTenant:
        function(req,res,next){
            function passwordHashed(err,hash) {
                function tenantCreated(err, tenant) {
                    if (err) {
                        return next(err)
                    }
                    return res.send(201, tenant)
                }

                var tenantToCreate=req.body;
                tenantToCreate.users=[
                    {
                        email:req.body.adminUser.email,
                        password:hash,
                        roles:[_globalOptions.tenantAdminRole]
                    }
                ]

                delete tenantToCreate.adminUser;
                kwaaiCrud.insert({collection:_globalOptions.tenantsCollection,schema:_globalOptions.schemas.storage,data:tenantToCreate},tenantCreated)

            }
            var invalid=kwaaiSchema.validateToSchema(req.body,_globalOptions.schemas.create)
            if (invalid){return res.send(400,invalid)}

            //todo check if tenant name exists
            hasher(req.body.adminUser.password).hash(passwordHashed)
        }

    ,createUser:
        function (req,res,next){
            function tenantRetrieved(err,tenant){
                if (err) {return next(err)}
                if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                    _globalOptions.cache.del(_globalOptions.name + "_" + tenant.name);
                }

                function userAdded(err,addedTenant){
                    if (err) {return next(err)}
                    console.log("User created");
                    res.send(204);
                }

                if(!tenant){return res.send(404,_globalOptions.name + " not found.")}
                for (var i=0;i<tenant.users.length;i++){
                    if (tenant.users[i].email.toLowerCase()==req.body.email.toLowerCase()){
                        return res.send(409,"User exists");
                    }
                }

                hasher(req.body.password).hash(function(error, hash) {

                    var newUser={
                        email:req.body.email,
                        password:hash
                    }

                    if (req.body.roles){newUser.roles=req.body.roles}
                    if (req.body.additonalInfo){newUser.additonalInfo=req.body.additonalInfo}

                    tenant.users.push(newUser);

                    kwaaiCrud.updateFull({collection:_globalOptions.tenantsCollection,schema:_globalOptions.schemas.storage,id:tenant._id,data:tenant},userAdded)
                });
            }
            console.log("creating new user...");
            var invalid=kwaaiSchema.validateToSchema(req.body,_globalOptions.schemas.user)
            if (invalid){return res.send(400,invalid)}

            kwaaiCrud.getById({collection: _globalOptions.tenantsCollection, id:req[_globalOptions.name]._id}, tenantRetrieved)
        }


    //********************************************************************************************************************************************
    //READ
    //*******************************************************************************************************************************************

    ,getTenantById:
        function(req,res,next){
            req.kwaaioptions={
                collection:_globalOptions.tenantsCollection,
                sendresponse:true
            }

            kwaaiCrudware.getById(req,res,next);
        }

    ,getTenantsByQuery:
        function(req,res,next){


            req.kwaaioptions={
                collection:_globalOptions.tenantsCollection,
                sendresponse:true
            }

            kwaaiCrudware.getByQuery(req,res,next);
        }

    ,checkTenantExists:
        function(req,res,next){
            function tenantRetrieved(err,tenant){
                if (err){return next(err)}
                if (tenant&&tenant.length>0){return res.send(409,_globalOptions.name + " name exists")}
                next();
            }

            if (req.params.id){
                if (!mongo.ObjectID.isValid(req.params.id)){return next("invalid tenant id");}
                kwaaiCrud.getByQuery({collection: _globalOptions.tenantsCollection, rawQuery: {find:{"name": req.body.name.toLowerCase(),_id:{$ne:new mongo.ObjectID(req.params.id)}}}}, tenantRetrieved)
            }else {
                kwaaiCrud.getByQuery({collection: _globalOptions.tenantsCollection, rawQuery: {find:{"name": req.body.name.toLowerCase()}}}, tenantRetrieved)
            }
        }

    ,getUsers:
        function(req,res,next){
            function tenantRetrieved(err,tenant){
                if (err) {return next(err)}
                if (!tenant){return res.send(404,"tenant not found")}
                for (var i=0;i<tenant.users.length;i++){
                    delete tenant.users[i].password;
                }
                return res.send(200,tenant.users);
            }
            multiTenantTools.getTenantbyName(req[_globalOptions.name].name,tenantRetrieved);
        }

    ,checkTenant:
        function(req,res,next){
            function setTenanttoReq(err,tenant){
                if (err){return next(err)}
                if (tenant==null){return res.send(404,"Invalid " + _globalOptions.name + " name")}

                console.log("tenant " + tenant.name + " found");

                var tenantId=new mongo.ObjectID(tenant._id.toString());

                //todo active
                req[_globalOptions.name]={
                    _id:tenantId,
                    name:tenant.name
                }
                req.body[_globalOptions.name+ "_id"]=tenantId;
                req.body[_globalOptions.name+ "_name"]=tenant.name;

                if (!req.query){req.query={}}

                req.query[_globalOptions.name+ "_id"]=tenantId;

                return next();
            }

            var tenantNameEnd = req.url.indexOf('/', 1);
            var tenantName="";
            if (tenantNameEnd==-1){
                tenantName = req.url.substring(1);
            }
            else {
                tenantName = req.url.substring(1, tenantNameEnd);
            }
            if (!tenantName||tenantName==""){return res.send(404,"Invalid " + _globalOptions.name + " name")}

            console.log("checking security for tenant " + tenantName);
            multiTenantTools.getTenantbyName(tenantName,setTenanttoReq)
        }

    ,checkUser:
    //tenantName,userName,password
        function(options,callback){

            var userToVerify=null;

            function tenantRetrieved(err,tenant){

                function hashedChecked(error, verified){
                    if (error) {console.error(error);return callback(error)}

                    if (!verified){
                        console.log("user not verified");
                        return callback(null,null);
                    } else {
                        console.log("user verified");
                        var copiedUser=deepCopy(userToVerify);
                        delete copiedUser.password;

                        return callback(null, userToVerify);
                    }
                }

                if (err){return callback(err)}
                var found = false;
                var lowerUsername = options.userName.toLowerCase();
                for (var i=0;i<tenant.users.length;i++){
                    var currentUser=tenant.users[i];
                    if (currentUser.email==lowerUsername){
                        console.log("found user " + currentUser.email);
                        found = true;
                        userToVerify = currentUser;
                        hasher(options.password).verifyAgainst(currentUser.password,hashedChecked);
                        break;
                    }
                }
                if (!found){
                    console.log("no user found" + currentUser.email);
                    return callback(null,null);
                }
            }

            multiTenantTools.getTenantbyName(options.tenantName,tenantRetrieved)
        }

    ,getTenantbyName:
        function(name,callback){
            function cacheChecked(err,value){
                if (!err&&value){
                    return callback(null,value);
                }

                function tenantRetrieved(err,tenants){
                    if (err){return callback(err)}
                    if(!tenants){return callback(null,null)}
                    if(tenants.length==0){return callback(null,null)}

                    if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                        tenants[0]._id =tenants[0]._id.toString();

                        _globalOptions.cache.set(_globalOptions.name + "_" + name,tenants[0]);
                    }

                    return callback(null,tenants[0])
                }

                kwaaiCrud.getByQuery({collection:_globalOptions.tenantsCollection,query:{"name":name.toLowerCase()}},tenantRetrieved)
            }

            if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                _globalOptions.cache.get(_globalOptions.name + "_" + name,cacheChecked);
            }
            else{
                cacheChecked(null,null)
            }


        }

    ,getUser:
        function(req,res,next){
            function tenantRetrieved(err,tenant){
                if (err){return next(err);}
                if (!tenant){return res.status(404).send("Tenant not found");}
                var foundUser=null;
                var found = false;
                var lowerUsername = req.params.email.toLowerCase();
                for (var i=0;i<tenant.users.length;i++){
                    var currentUser=tenant.users[i];
                    if (currentUser.email==lowerUsername){
                        console.log("found user " + currentUser.email);
                        found = true;
                        foundUser = currentUser;
                        break;
                    }
                }
                if (!found){
                    return res.status(404).send("User not found");
                }else{
                    var copiedUser=deepCopy(foundUser);
                    delete copiedUser.password;
                    return res.status(200).send(copiedUser);
                }
            }

            multiTenantTools.getTenantbyName(req[_globalOptions.name].name,tenantRetrieved)
        }

    //********************************************************************************************************************************************
    //UPDATE
    //*******************************************************************************************************************************************

    ,updateTenantFull:
        function(req,res,next){

            if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                _globalOptions.cache.delKeys(_globalOptions.name + "_*");
            }

            req.kwaaioptions={
                collection:_globalOptions.tenantsCollection,
                schema:tenantSchema,
                sendresponse:true
            }

            kwaaiCrudware.updateFull(req,res,next);

        }

    ,updateTenantPart:
        function(req,res,next){

            if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                _globalOptions.cache.delKeys(_globalOptions.name + "_*");
            }

            req.kwaaioptions={
                collection:_globalOptions.tenantsCollection,
                schema:tenantSchema,
                sendresponse:true
            }

            kwaaiCrudware.updatePart(req,res,next);

        }

    ,addAdminTenant:
        function(req,res,next){


            function adminRetrieved(err,adminTenant){
                if(err){return next(err)}
                req.body[_globalOptions.name + "_id"]=adminTenant._id;
                next();
            }
            multiTenantTools.getTenantbyName("admin",adminRetrieved)
        }

    ,resetPassword:
        function(req,res,next){
            return next("Not implemented");

        }

    ,updatePassword:
        function(req,res,next){
            return next("Not implemented");
        }

    ,updateUser:
        function(req,res,next){
            function tenantRetrieved(err,tenant){
                if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                    _globalOptions.cache.del(_globalOptions.name + "_" + req[_globalOptions.name].name);
                }

                if (err) {return next(err)}
                if (!tenant){return res.status(404).send("Tenant not found");}

                function userUpdated(err,result){
                    if (err) {return next(err)}
                    if (result==0){return res.status(304).end();}
                    res.status(204).end();
                }

                var foundUser=-1;
                for (var i=0;i<tenant.users.length;i++){
                    if (tenant.users[i].email.toLowerCase()==req.params.email.toLowerCase()){
                        foundUser=i;
                        break;
                    }
                }
                if (foundUser==-1){return res.status(404).send("user not found.");}


                //check if e-mail changed
                if (tenant.users[foundUser].email.toLowerCase()!=req.body.email.toLowerCase()){
                    for (var i=0;i<tenant.users.length;i++){
                        if (i!=foundUser&&tenant.users[i].email.toLowerCase()==req.body.email.toLowerCase()){
                            return res.status(409).send("email exists for user.")
                        }
                    }
                }

                //check not hacking in super admin
                if (req.body.roles){
                    for (var i=0;i<req.body.roles.length;i++){
                        if (req.body.roles==_globalOptions.adminRole){
                            return next("Unable to set roles");
                        }
                    }
                }

                tenant.users[foundUser]={
                    email:(req.body.email? req.body.email:req.params.email.toLowerCase()),
                    password:tenant.users[foundUser].password,
                    roles:req.body.roles
                };
                if (req.body.additionalInfo){tenant.users[foundUser].additionalInfo=req.body.additionalInfo;}

                kwaaiCrud.updateFull({collection:_globalOptions.tenantsCollection,schema:_globalOptions.schemas.storage,id:tenant._id,data:tenant},userUpdated)
            }

            var invalid=kwaaiSchema.validateToSchema(req.body,_globalOptions.schemas.user)
            if (invalid){return res.send(400,invalid)}
            multiTenantTools.getTenantbyName(req[_globalOptions.name].name,tenantRetrieved);

        }
    //********************************************************************************************************************************************
    //DELETE
    //*******************************************************************************************************************************************

    ,deleteTenant:
        function(req,res,next){
            if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                _globalOptions.cache.delKeys(_globalOptions.name + "_*");
            }

            req.kwaaioptions={
                collection:_globalOptions.tenantsCollection,
                sendresponse:true
            }

            kwaaiCrudware.delete(req,res,next);
        }

    ,deleteUser:
        function(req,res,next){
            function tenantRetrieved(err,tenant){
                if (_globalOptions.cache&&_globalOptions.cache.isAvailable){
                    _globalOptions.cache.del(_globalOptions.name + "_" + req[_globalOptions.name].name);
                }

                if (err) {return next(err)}
                if (!tenant){return res.status(404).send("Tenant not found");}

                function userDeleted(err){
                    if (err) {return next(err)}
                    res.status(204).end();
                }



                var foundUser=-1;
                for (var i=0;i<tenant.users.length;i++){
                    if (tenant.users[i].email.toLowerCase()==req.params.email.toLowerCase()){
                        foundUser=i;
                        break;
                    }
                }
                if (foundUser==-1){return res.send(404,"user not found.")}
                tenant.users.splice(foundUser,1);

                kwaaiCrud.updateFull({collection:_globalOptions.tenantsCollection,schema:_globalOptions.schemas.storage,id:tenant._id,data:tenant},userDeleted)
            }
            multiTenantTools.getTenantbyName(req[_globalOptions.name].name,tenantRetrieved);
        }

}


var service= function(options){
    _globalOptions=options;

    multiTenantTools.addSecurityRoutes=function(app){
        app.get("/admin/" + _globalOptions.plural,kwaaiCrudware.onlyForRoles([_globalOptions.adminRole]),this.getTenantsByQuery);
        app.post("/admin/" + _globalOptions.plural,kwaaiCrudware.onlyForRoles([_globalOptions.adminRole]),this.checkTenantExists,this.createTenant);
        app.get("/:" +  _globalOptions.name + "/users",kwaaiCrudware.onlyForRoles([_globalOptions.tenantAdminRole]),this.getUsers);
        app.post("/:" + _globalOptions.name + "/users",kwaaiCrudware.onlyForRoles([_globalOptions.tenantAdminRole]),this.createUser);
        app.put("/:" + _globalOptions.name + "/users/:email",kwaaiCrudware.onlyForRoles([_globalOptions.tenantAdminRole]),this.updateUser);
        app.get("/:" + _globalOptions.name + "/users/:email",kwaaiCrudware.onlyForRoles([_globalOptions.tenantAdminRole]),this.getUser);
        app.delete("/:" + _globalOptions.name + "/users/:email",kwaaiCrudware.onlyForRoles([_globalOptions.tenantAdminRole]),this.deleteUser);
    }



    return multiTenantTools;
}

module.exports=service;


